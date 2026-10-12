import base64
import ctypes
import ctypes.util
import hashlib
import json
import pathlib
import sys


class InBuffer(ctypes.Structure):
    _fields_ = [('src', ctypes.c_void_p), ('size', ctypes.c_size_t), ('pos', ctypes.c_size_t)]


class OutBuffer(ctypes.Structure):
    _fields_ = [('dst', ctypes.c_void_p), ('size', ctypes.c_size_t), ('pos', ctypes.c_size_t)]


# 只使用宿主既有 native library，沒有套件安裝或遠端資料來源。
def engine():
    name = ctypes.util.find_library('zstd')
    if not name:
        raise RuntimeError('Native Zstd fixture engine unavailable')
    lib = ctypes.CDLL(name)
    signatures = {
        'ZSTD_compressBound': ([ctypes.c_size_t], ctypes.c_size_t),
        'ZSTD_compress': ([ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int], ctypes.c_size_t),
        'ZSTD_decompress': ([ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t], ctypes.c_size_t),
        'ZSTD_isError': ([ctypes.c_size_t], ctypes.c_uint),
        'ZSTD_createCCtx': ([], ctypes.c_void_p),
        'ZSTD_freeCCtx': ([ctypes.c_void_p], ctypes.c_size_t),
        'ZSTD_CCtx_setParameter': ([ctypes.c_void_p, ctypes.c_int, ctypes.c_int], ctypes.c_size_t),
        'ZSTD_compressStream2': ([ctypes.c_void_p, ctypes.POINTER(OutBuffer), ctypes.POINTER(InBuffer), ctypes.c_int], ctypes.c_size_t),
        'ZSTD_versionString': ([], ctypes.c_char_p),
    }
    for name, (args, result) in signatures.items():
        fn = getattr(lib, name)
        fn.argtypes = args
        fn.restype = result
    return lib


# native 自己驗原始公開文字，不以 fzstd 的 round-trip 判定正案。
def compress(lib, plain):
    cap = lib.ZSTD_compressBound(len(plain))
    source = ctypes.create_string_buffer(plain)
    output = ctypes.create_string_buffer(cap)
    length = lib.ZSTD_compress(output, cap, source, len(plain), 3)
    if lib.ZSTD_isError(length):
        raise RuntimeError('Native public compression failed')
    return output.raw[:length]


# 以 native flush 建立真正跨 block backreference，frame window 固定 1KiB。
def multiblock(lib, pieces):
    ctx = lib.ZSTD_createCCtx()
    if not ctx:
        raise RuntimeError('Native compression context unavailable')
    result = bytearray()
    try:
        for parameter, value in [(101, 10), (200, 0), (201, 0)]:
            if lib.ZSTD_isError(lib.ZSTD_CCtx_setParameter(ctx, parameter, value)):
                raise RuntimeError('Native public streaming configuration failed')
        for index, piece in enumerate(pieces):
            source = ctypes.create_string_buffer(piece)
            incoming = InBuffer(ctypes.cast(source, ctypes.c_void_p), len(piece), 0)
            directive = 2 if index == len(pieces) - 1 else 1
            while True:
                output = ctypes.create_string_buffer(65536)
                outgoing = OutBuffer(ctypes.cast(output, ctypes.c_void_p), len(output), 0)
                remaining = lib.ZSTD_compressStream2(ctx, ctypes.byref(outgoing), ctypes.byref(incoming), directive)
                if lib.ZSTD_isError(remaining):
                    raise RuntimeError('Native public streaming compression failed')
                result.extend(output.raw[:outgoing.pos])
                if remaining == 0 and incoming.pos == incoming.size:
                    break
        return bytes(result)
    finally:
        lib.ZSTD_freeCCtx(ctx)


# 去掉 single-segment FCS，以 native 再驗內容及 window，不自己產生熵碼。
def no_fcs(frame, descriptor):
    flag = frame[4]
    if flag & 0x1f or not flag & 0x20:
        raise RuntimeError('Public native frame header unexpected')
    width = (1 << (flag >> 6)) if flag >> 6 else 1
    return frame[:4] + bytes([0, descriptor]) + frame[5 + width:]


# 每一案由 native 分別判定完整合法或拒絕，JSON 不存原生錯誤訊息。
def sample(lib, name, data, plain=None, code=None):
    source = ctypes.create_string_buffer(data)
    output = ctypes.create_string_buffer(131072)
    length = lib.ZSTD_decompress(output, len(output), source, len(data))
    rejected = bool(lib.ZSTD_isError(length))
    if plain is None:
        if not rejected:
            raise RuntimeError('Native negative oracle unexpectedly accepted public frame')
    elif rejected or output.raw[:length] != plain:
        raise RuntimeError('Native positive oracle failed')
    return {
        'name': name,
        'compressed': base64.b64encode(data).decode('ascii'),
        'sha256': hashlib.sha256(data).hexdigest(),
        'native_valid': not rejected,
        'bytes': len(plain) if plain is not None else None,
        'plain_sha256': hashlib.sha256(plain).hexdigest() if plain is not None else None,
        'operation_code': code,
        'engine': 'libzstd',
        'version': lib.ZSTD_versionString().decode('ascii'),
    }


# 只產生固定公有 corpus，全部負案先交獨立 native engine 驗明。
def prepare(destination):
    lib = engine()
    rows = []
    inputs = [('ascii', b'Public RdWeb clipboard fixture\n' * 32),
              ('unicode', ('公開繁體中文剪貼簿測試\n' * 64).encode('utf-8')),
              ('boundary', b'A' * 32768), ('empty', b'')]
    for name, plain in inputs:
        frame = compress(lib, plain)
        rows.append(sample(lib, name, frame, plain))
        if name in ['ascii', 'unicode']:
            if frame[4] != 0x60:
                raise RuntimeError('Public FCS mutation shape unexpected')
            for size in [256, 257, 512, len(plain) - 1, len(plain) + 1]:
                bad = bytearray(frame)
                bad[5:7] = (size - 256).to_bytes(2, 'little')
                rows.append(sample(lib, name + '-fcs-' + str(size), bytes(bad), code='clipboard_invalid'))
        rows.append(sample(lib, name + '-no-fcs', no_fcs(frame, 40), plain))
    piece = b'Public cross-block history\n' * 16
    rows.append(sample(lib, 'cross-block-history', multiblock(lib, [piece, piece]), piece * 2))
    oversized = b'A' * 32769
    rows.append(sample(lib, 'oversized-no-fcs', no_fcs(compress(lib, oversized), 48), oversized, 'clipboard_too_large'))
    magic = bytes([0x28, 0xb5, 0x2f, 0xfd, 0x20, 1])
    rows.append(sample(lib, 'raw-one-byte', magic + bytes([9, 0, 0, 65]), b'A'))
    rows.append(sample(lib, 'rle-one-byte', magic + bytes([11, 0, 0, 65]), b'A'))
    for name, block in [('raw-overflow', [17, 0, 0, 65, 66]),
                        ('rle-overflow', [19, 0, 0, 65]),
                        ('literal-rle-overflow', [29, 0, 0, 17, 65, 0])]:
        rows.append(sample(lib, name, magic + bytes(block), code='clipboard_too_large'))
    path = pathlib.Path(destination)
    if not path.parent.is_dir():
        raise RuntimeError('Public fixture destination unavailable')
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Native public bounds corpus: PASS (' + str(len(rows)) + ' cases)')


if __name__ == '__main__':
    prepare(sys.argv[1])
