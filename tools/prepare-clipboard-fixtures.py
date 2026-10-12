import base64
import ctypes
import ctypes.util
import hashlib
import json
import pathlib
import sys


# 使用宿主既有 native compressor 產生公開 oracle，不讀遠端剪貼簿。
def prepare(destination):
    name = ctypes.util.find_library('zstd')
    if not name:
        raise RuntimeError('Existing native Zstd fixture engine is unavailable')
    lib = ctypes.CDLL(name)
    lib.ZSTD_versionString.restype = ctypes.c_char_p
    lib.ZSTD_compressBound.argtypes = [ctypes.c_size_t]
    lib.ZSTD_compressBound.restype = ctypes.c_size_t
    lib.ZSTD_compress.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int]
    lib.ZSTD_compress.restype = ctypes.c_size_t
    lib.ZSTD_decompress.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t]
    lib.ZSTD_decompress.restype = ctypes.c_size_t
    lib.ZSTD_isError.argtypes = [ctypes.c_size_t]
    lib.ZSTD_isError.restype = ctypes.c_uint
    samples = []
    for label, text in [('ascii', 'Public RdWeb clipboard fixture\n' * 32), ('unicode', '公開繁體中文剪貼簿測試\n' * 64)]:
        plain = text.encode('utf-8')
        source = ctypes.create_string_buffer(plain)
        cap = lib.ZSTD_compressBound(len(plain))
        output = ctypes.create_string_buffer(cap)
        length = lib.ZSTD_compress(output, cap, source, len(plain), 3)
        if lib.ZSTD_isError(length):
            raise RuntimeError('Public Zstd compression failed')
        compressed = output.raw[:length]
        decoded = ctypes.create_string_buffer(len(plain))
        decoded_length = lib.ZSTD_decompress(decoded, len(plain), output, length)
        if lib.ZSTD_isError(decoded_length) or decoded_length != len(plain) or decoded.raw != plain:
            raise RuntimeError('Public native Zstd oracle failed')
        samples.append({'name': label, 'plain': text, 'bytes': len(plain),
                        'compressed': base64.b64encode(compressed).decode('ascii'),
                        'sha256': hashlib.sha256(compressed).hexdigest(),
                        'engine': 'libzstd', 'version': lib.ZSTD_versionString().decode('ascii'), 'level': 3})
    path = pathlib.Path(destination)
    if not path.parent.is_dir():
        raise RuntimeError('Public fixture destination parent is unavailable')
    path.write_text(json.dumps(samples, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Public native Zstd fixtures: PASS')


if __name__ == '__main__':
    prepare(sys.argv[1])
