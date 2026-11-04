// Generated from rustdesk/hbb_common 334641686c731631fc51524bb2aa2ec2773069ee; AGPL-3.0, RustDesk contributors.
// message.proto SHA256 963cb7b27752edf7c200f563607fdbef76e1792951cbb4bb21d72508435f08eb; protobufjs-cli 2.7.0. Do not edit.
import * as $protobuf from "protobufjs";
import Long = require("long");

/** Namespace hbb. */
export namespace hbb {

    /**
     * Properties of an EncodedVideoFrame.
     * @deprecated Use hbb.EncodedVideoFrame.$Properties instead.
     */
    interface IEncodedVideoFrame extends hbb.EncodedVideoFrame.$Properties {
    }

    /** Represents an EncodedVideoFrame. */
    class EncodedVideoFrame {

        /**
         * Constructs a new EncodedVideoFrame.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.EncodedVideoFrame.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** EncodedVideoFrame data. */
        data: Uint8Array;

        /** EncodedVideoFrame key. */
        key: boolean;

        /** EncodedVideoFrame pts. */
        pts: (number|Long);

        /**
         * Creates a new EncodedVideoFrame instance using the specified properties.
         * @param [properties] Properties to set
         * @returns EncodedVideoFrame instance
         */
        static create(properties: hbb.EncodedVideoFrame.$Shape): hbb.EncodedVideoFrame & hbb.EncodedVideoFrame.$Shape;
        static create(properties?: hbb.EncodedVideoFrame.$Properties): hbb.EncodedVideoFrame;

        /**
         * Encodes the specified EncodedVideoFrame message. Does not implicitly {@link hbb.EncodedVideoFrame.verify|verify} messages.
         * @param message EncodedVideoFrame message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.EncodedVideoFrame.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified EncodedVideoFrame message, length delimited. Does not implicitly {@link hbb.EncodedVideoFrame.verify|verify} messages.
         * @param message EncodedVideoFrame message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.EncodedVideoFrame.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an EncodedVideoFrame message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.EncodedVideoFrame & hbb.EncodedVideoFrame.$Shape} EncodedVideoFrame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.EncodedVideoFrame & hbb.EncodedVideoFrame.$Shape;

        /**
         * Decodes an EncodedVideoFrame message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.EncodedVideoFrame & hbb.EncodedVideoFrame.$Shape} EncodedVideoFrame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.EncodedVideoFrame & hbb.EncodedVideoFrame.$Shape;

        /**
         * Verifies an EncodedVideoFrame message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an EncodedVideoFrame message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns EncodedVideoFrame
         */
        static fromObject(object: { [k: string]: any }): hbb.EncodedVideoFrame;

        /**
         * Creates a plain object from an EncodedVideoFrame message. Also converts values to other types if specified.
         * @param message EncodedVideoFrame
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.EncodedVideoFrame, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this EncodedVideoFrame to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for EncodedVideoFrame
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace EncodedVideoFrame {

        /** Properties of an EncodedVideoFrame. */
        interface $Properties {

            /** EncodedVideoFrame data */
            data?: (Uint8Array|null);

            /** EncodedVideoFrame key */
            key?: (boolean|null);

            /** EncodedVideoFrame pts */
            pts?: (number|Long|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an EncodedVideoFrame. */
        type $Shape = hbb.EncodedVideoFrame.$Properties;
    }

    /**
     * Properties of an EncodedVideoFrames.
     * @deprecated Use hbb.EncodedVideoFrames.$Properties instead.
     */
    interface IEncodedVideoFrames extends hbb.EncodedVideoFrames.$Properties {
    }

    /** Represents an EncodedVideoFrames. */
    class EncodedVideoFrames {

        /**
         * Constructs a new EncodedVideoFrames.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.EncodedVideoFrames.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** EncodedVideoFrames frames. */
        frames: hbb.EncodedVideoFrame.$Properties[];

        /**
         * Creates a new EncodedVideoFrames instance using the specified properties.
         * @param [properties] Properties to set
         * @returns EncodedVideoFrames instance
         */
        static create(properties: hbb.EncodedVideoFrames.$Shape): hbb.EncodedVideoFrames & hbb.EncodedVideoFrames.$Shape;
        static create(properties?: hbb.EncodedVideoFrames.$Properties): hbb.EncodedVideoFrames;

        /**
         * Encodes the specified EncodedVideoFrames message. Does not implicitly {@link hbb.EncodedVideoFrames.verify|verify} messages.
         * @param message EncodedVideoFrames message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.EncodedVideoFrames.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified EncodedVideoFrames message, length delimited. Does not implicitly {@link hbb.EncodedVideoFrames.verify|verify} messages.
         * @param message EncodedVideoFrames message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.EncodedVideoFrames.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an EncodedVideoFrames message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.EncodedVideoFrames & hbb.EncodedVideoFrames.$Shape} EncodedVideoFrames
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.EncodedVideoFrames & hbb.EncodedVideoFrames.$Shape;

        /**
         * Decodes an EncodedVideoFrames message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.EncodedVideoFrames & hbb.EncodedVideoFrames.$Shape} EncodedVideoFrames
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.EncodedVideoFrames & hbb.EncodedVideoFrames.$Shape;

        /**
         * Verifies an EncodedVideoFrames message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an EncodedVideoFrames message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns EncodedVideoFrames
         */
        static fromObject(object: { [k: string]: any }): hbb.EncodedVideoFrames;

        /**
         * Creates a plain object from an EncodedVideoFrames message. Also converts values to other types if specified.
         * @param message EncodedVideoFrames
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.EncodedVideoFrames, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this EncodedVideoFrames to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for EncodedVideoFrames
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace EncodedVideoFrames {

        /** Properties of an EncodedVideoFrames. */
        interface $Properties {

            /** EncodedVideoFrames frames */
            frames?: (hbb.EncodedVideoFrame.$Properties[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an EncodedVideoFrames. */
        type $Shape = hbb.EncodedVideoFrames.$Properties;
    }

    /**
     * Properties of a RGB.
     * @deprecated Use hbb.RGB.$Properties instead.
     */
    interface IRGB extends hbb.RGB.$Properties {
    }

    /** Represents a RGB. */
    class RGB {

        /**
         * Constructs a new RGB.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RGB.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RGB compress. */
        compress: boolean;

        /**
         * Creates a new RGB instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RGB instance
         */
        static create(properties: hbb.RGB.$Shape): hbb.RGB & hbb.RGB.$Shape;
        static create(properties?: hbb.RGB.$Properties): hbb.RGB;

        /**
         * Encodes the specified RGB message. Does not implicitly {@link hbb.RGB.verify|verify} messages.
         * @param message RGB message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RGB.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RGB message, length delimited. Does not implicitly {@link hbb.RGB.verify|verify} messages.
         * @param message RGB message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RGB.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RGB message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RGB & hbb.RGB.$Shape} RGB
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RGB & hbb.RGB.$Shape;

        /**
         * Decodes a RGB message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RGB & hbb.RGB.$Shape} RGB
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RGB & hbb.RGB.$Shape;

        /**
         * Verifies a RGB message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RGB message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RGB
         */
        static fromObject(object: { [k: string]: any }): hbb.RGB;

        /**
         * Creates a plain object from a RGB message. Also converts values to other types if specified.
         * @param message RGB
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RGB, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RGB to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RGB
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RGB {

        /** Properties of a RGB. */
        interface $Properties {

            /** RGB compress */
            compress?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a RGB. */
        type $Shape = hbb.RGB.$Properties;
    }

    /**
     * Properties of a YUV.
     * @deprecated Use hbb.YUV.$Properties instead.
     */
    interface IYUV extends hbb.YUV.$Properties {
    }

    /** Represents a YUV. */
    class YUV {

        /**
         * Constructs a new YUV.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.YUV.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** YUV compress. */
        compress: boolean;

        /** YUV stride. */
        stride: number;

        /**
         * Creates a new YUV instance using the specified properties.
         * @param [properties] Properties to set
         * @returns YUV instance
         */
        static create(properties: hbb.YUV.$Shape): hbb.YUV & hbb.YUV.$Shape;
        static create(properties?: hbb.YUV.$Properties): hbb.YUV;

        /**
         * Encodes the specified YUV message. Does not implicitly {@link hbb.YUV.verify|verify} messages.
         * @param message YUV message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.YUV.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified YUV message, length delimited. Does not implicitly {@link hbb.YUV.verify|verify} messages.
         * @param message YUV message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.YUV.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a YUV message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.YUV & hbb.YUV.$Shape} YUV
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.YUV & hbb.YUV.$Shape;

        /**
         * Decodes a YUV message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.YUV & hbb.YUV.$Shape} YUV
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.YUV & hbb.YUV.$Shape;

        /**
         * Verifies a YUV message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a YUV message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns YUV
         */
        static fromObject(object: { [k: string]: any }): hbb.YUV;

        /**
         * Creates a plain object from a YUV message. Also converts values to other types if specified.
         * @param message YUV
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.YUV, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this YUV to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for YUV
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace YUV {

        /** Properties of a YUV. */
        interface $Properties {

            /** YUV compress */
            compress?: (boolean|null);

            /** YUV stride */
            stride?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a YUV. */
        type $Shape = hbb.YUV.$Properties;
    }

    /** Chroma enum. */
    enum Chroma {

        /** I420 value */
        I420 = 0,

        /** I444 value */
        I444 = 1
    }

    /**
     * Properties of a VideoFrame.
     * @deprecated Use hbb.VideoFrame.$Properties instead.
     */
    interface IVideoFrame extends hbb.VideoFrame.$Properties {
    }

    /** Represents a VideoFrame. */
    class VideoFrame {

        /**
         * Constructs a new VideoFrame.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.VideoFrame.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** VideoFrame vp9s. */
        vp9s?: (hbb.EncodedVideoFrames.$Properties|null);

        /** VideoFrame rgb. */
        rgb?: (hbb.RGB.$Properties|null);

        /** VideoFrame yuv. */
        yuv?: (hbb.YUV.$Properties|null);

        /** VideoFrame h264s. */
        h264s?: (hbb.EncodedVideoFrames.$Properties|null);

        /** VideoFrame h265s. */
        h265s?: (hbb.EncodedVideoFrames.$Properties|null);

        /** VideoFrame vp8s. */
        vp8s?: (hbb.EncodedVideoFrames.$Properties|null);

        /** VideoFrame av1s. */
        av1s?: (hbb.EncodedVideoFrames.$Properties|null);

        /** VideoFrame display. */
        display: number;

        /** VideoFrame union. */
        union?: ("vp9s"|"rgb"|"yuv"|"h264s"|"h265s"|"vp8s"|"av1s");

        /**
         * Creates a new VideoFrame instance using the specified properties.
         * @param [properties] Properties to set
         * @returns VideoFrame instance
         */
        static create(properties: hbb.VideoFrame.$Shape): hbb.VideoFrame & hbb.VideoFrame.$Shape;
        static create(properties?: hbb.VideoFrame.$Properties): hbb.VideoFrame;

        /**
         * Encodes the specified VideoFrame message. Does not implicitly {@link hbb.VideoFrame.verify|verify} messages.
         * @param message VideoFrame message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.VideoFrame.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified VideoFrame message, length delimited. Does not implicitly {@link hbb.VideoFrame.verify|verify} messages.
         * @param message VideoFrame message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.VideoFrame.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a VideoFrame message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.VideoFrame & hbb.VideoFrame.$Shape} VideoFrame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.VideoFrame & hbb.VideoFrame.$Shape;

        /**
         * Decodes a VideoFrame message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.VideoFrame & hbb.VideoFrame.$Shape} VideoFrame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.VideoFrame & hbb.VideoFrame.$Shape;

        /**
         * Verifies a VideoFrame message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a VideoFrame message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns VideoFrame
         */
        static fromObject(object: { [k: string]: any }): hbb.VideoFrame;

        /**
         * Creates a plain object from a VideoFrame message. Also converts values to other types if specified.
         * @param message VideoFrame
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.VideoFrame, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this VideoFrame to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for VideoFrame
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace VideoFrame {

        /** Properties of a VideoFrame. */
        interface $Properties {

            /** VideoFrame vp9s */
            vp9s?: (hbb.EncodedVideoFrames.$Properties|null);

            /** VideoFrame rgb */
            rgb?: (hbb.RGB.$Properties|null);

            /** VideoFrame yuv */
            yuv?: (hbb.YUV.$Properties|null);

            /** VideoFrame h264s */
            h264s?: (hbb.EncodedVideoFrames.$Properties|null);

            /** VideoFrame h265s */
            h265s?: (hbb.EncodedVideoFrames.$Properties|null);

            /** VideoFrame vp8s */
            vp8s?: (hbb.EncodedVideoFrames.$Properties|null);

            /** VideoFrame av1s */
            av1s?: (hbb.EncodedVideoFrames.$Properties|null);

            /** VideoFrame display */
            display?: (number|null);

            /** VideoFrame union */
            union?: ("vp9s"|"rgb"|"yuv"|"h264s"|"h265s"|"vp8s"|"av1s");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a VideoFrame. */
        type $Shape = {
          vp9s?: hbb.EncodedVideoFrames.$Shape|null;
          rgb?: hbb.RGB.$Shape|null;
          yuv?: hbb.YUV.$Shape|null;
          h264s?: hbb.EncodedVideoFrames.$Shape|null;
          h265s?: hbb.EncodedVideoFrames.$Shape|null;
          vp8s?: hbb.EncodedVideoFrames.$Shape|null;
          av1s?: hbb.EncodedVideoFrames.$Shape|null;
          display?: number|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; vp9s?: null; rgb?: null; yuv?: null; h264s?: null; h265s?: null; vp8s?: null; av1s?: null }|{ union?: "vp9s"; vp9s: hbb.EncodedVideoFrames.$Shape; rgb?: null; yuv?: null; h264s?: null; h265s?: null; vp8s?: null; av1s?: null }|{ union?: "rgb"; vp9s?: null; rgb: hbb.RGB.$Shape; yuv?: null; h264s?: null; h265s?: null; vp8s?: null; av1s?: null }|{ union?: "yuv"; vp9s?: null; rgb?: null; yuv: hbb.YUV.$Shape; h264s?: null; h265s?: null; vp8s?: null; av1s?: null }|{ union?: "h264s"; vp9s?: null; rgb?: null; yuv?: null; h264s: hbb.EncodedVideoFrames.$Shape; h265s?: null; vp8s?: null; av1s?: null }|{ union?: "h265s"; vp9s?: null; rgb?: null; yuv?: null; h264s?: null; h265s: hbb.EncodedVideoFrames.$Shape; vp8s?: null; av1s?: null }|{ union?: "vp8s"; vp9s?: null; rgb?: null; yuv?: null; h264s?: null; h265s?: null; vp8s: hbb.EncodedVideoFrames.$Shape; av1s?: null }|{ union?: "av1s"; vp9s?: null; rgb?: null; yuv?: null; h264s?: null; h265s?: null; vp8s?: null; av1s: hbb.EncodedVideoFrames.$Shape })
        );
    }

    /**
     * Properties of an IdPk.
     * @deprecated Use hbb.IdPk.$Properties instead.
     */
    interface IIdPk extends hbb.IdPk.$Properties {
    }

    /** Represents an IdPk. */
    class IdPk {

        /**
         * Constructs a new IdPk.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.IdPk.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** IdPk id. */
        id: string;

        /** IdPk pk. */
        pk: Uint8Array;

        /**
         * Creates a new IdPk instance using the specified properties.
         * @param [properties] Properties to set
         * @returns IdPk instance
         */
        static create(properties: hbb.IdPk.$Shape): hbb.IdPk & hbb.IdPk.$Shape;
        static create(properties?: hbb.IdPk.$Properties): hbb.IdPk;

        /**
         * Encodes the specified IdPk message. Does not implicitly {@link hbb.IdPk.verify|verify} messages.
         * @param message IdPk message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.IdPk.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified IdPk message, length delimited. Does not implicitly {@link hbb.IdPk.verify|verify} messages.
         * @param message IdPk message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.IdPk.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an IdPk message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.IdPk & hbb.IdPk.$Shape} IdPk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.IdPk & hbb.IdPk.$Shape;

        /**
         * Decodes an IdPk message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.IdPk & hbb.IdPk.$Shape} IdPk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.IdPk & hbb.IdPk.$Shape;

        /**
         * Verifies an IdPk message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an IdPk message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns IdPk
         */
        static fromObject(object: { [k: string]: any }): hbb.IdPk;

        /**
         * Creates a plain object from an IdPk message. Also converts values to other types if specified.
         * @param message IdPk
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.IdPk, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this IdPk to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for IdPk
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace IdPk {

        /** Properties of an IdPk. */
        interface $Properties {

            /** IdPk id */
            id?: (string|null);

            /** IdPk pk */
            pk?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an IdPk. */
        type $Shape = hbb.IdPk.$Properties;
    }

    /**
     * Properties of a DisplayInfo.
     * @deprecated Use hbb.DisplayInfo.$Properties instead.
     */
    interface IDisplayInfo extends hbb.DisplayInfo.$Properties {
    }

    /** Represents a DisplayInfo. */
    class DisplayInfo {

        /**
         * Constructs a new DisplayInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.DisplayInfo.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** DisplayInfo x. */
        x: number;

        /** DisplayInfo y. */
        y: number;

        /** DisplayInfo width. */
        width: number;

        /** DisplayInfo height. */
        height: number;

        /** DisplayInfo name. */
        name: string;

        /** DisplayInfo online. */
        online: boolean;

        /** DisplayInfo cursorEmbedded. */
        cursorEmbedded: boolean;

        /** DisplayInfo originalResolution. */
        originalResolution?: (hbb.Resolution.$Properties|null);

        /** DisplayInfo scale. */
        scale: number;

        /**
         * Creates a new DisplayInfo instance using the specified properties.
         * @param [properties] Properties to set
         * @returns DisplayInfo instance
         */
        static create(properties: hbb.DisplayInfo.$Shape): hbb.DisplayInfo & hbb.DisplayInfo.$Shape;
        static create(properties?: hbb.DisplayInfo.$Properties): hbb.DisplayInfo;

        /**
         * Encodes the specified DisplayInfo message. Does not implicitly {@link hbb.DisplayInfo.verify|verify} messages.
         * @param message DisplayInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.DisplayInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified DisplayInfo message, length delimited. Does not implicitly {@link hbb.DisplayInfo.verify|verify} messages.
         * @param message DisplayInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.DisplayInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a DisplayInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.DisplayInfo & hbb.DisplayInfo.$Shape} DisplayInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.DisplayInfo & hbb.DisplayInfo.$Shape;

        /**
         * Decodes a DisplayInfo message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.DisplayInfo & hbb.DisplayInfo.$Shape} DisplayInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.DisplayInfo & hbb.DisplayInfo.$Shape;

        /**
         * Verifies a DisplayInfo message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a DisplayInfo message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns DisplayInfo
         */
        static fromObject(object: { [k: string]: any }): hbb.DisplayInfo;

        /**
         * Creates a plain object from a DisplayInfo message. Also converts values to other types if specified.
         * @param message DisplayInfo
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.DisplayInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this DisplayInfo to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for DisplayInfo
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace DisplayInfo {

        /** Properties of a DisplayInfo. */
        interface $Properties {

            /** DisplayInfo x */
            x?: (number|null);

            /** DisplayInfo y */
            y?: (number|null);

            /** DisplayInfo width */
            width?: (number|null);

            /** DisplayInfo height */
            height?: (number|null);

            /** DisplayInfo name */
            name?: (string|null);

            /** DisplayInfo online */
            online?: (boolean|null);

            /** DisplayInfo cursorEmbedded */
            cursorEmbedded?: (boolean|null);

            /** DisplayInfo originalResolution */
            originalResolution?: (hbb.Resolution.$Properties|null);

            /** DisplayInfo scale */
            scale?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a DisplayInfo. */
        type $Shape = hbb.DisplayInfo.$Properties;
    }

    /**
     * Properties of a PortForward.
     * @deprecated Use hbb.PortForward.$Properties instead.
     */
    interface IPortForward extends hbb.PortForward.$Properties {
    }

    /** Represents a PortForward. */
    class PortForward {

        /**
         * Constructs a new PortForward.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PortForward.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PortForward host. */
        host: string;

        /** PortForward port. */
        port: number;

        /**
         * Creates a new PortForward instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PortForward instance
         */
        static create(properties: hbb.PortForward.$Shape): hbb.PortForward & hbb.PortForward.$Shape;
        static create(properties?: hbb.PortForward.$Properties): hbb.PortForward;

        /**
         * Encodes the specified PortForward message. Does not implicitly {@link hbb.PortForward.verify|verify} messages.
         * @param message PortForward message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PortForward.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PortForward message, length delimited. Does not implicitly {@link hbb.PortForward.verify|verify} messages.
         * @param message PortForward message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PortForward.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PortForward message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PortForward & hbb.PortForward.$Shape} PortForward
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PortForward & hbb.PortForward.$Shape;

        /**
         * Decodes a PortForward message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PortForward & hbb.PortForward.$Shape} PortForward
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PortForward & hbb.PortForward.$Shape;

        /**
         * Verifies a PortForward message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PortForward message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PortForward
         */
        static fromObject(object: { [k: string]: any }): hbb.PortForward;

        /**
         * Creates a plain object from a PortForward message. Also converts values to other types if specified.
         * @param message PortForward
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PortForward, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PortForward to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PortForward
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PortForward {

        /** Properties of a PortForward. */
        interface $Properties {

            /** PortForward host */
            host?: (string|null);

            /** PortForward port */
            port?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PortForward. */
        type $Shape = hbb.PortForward.$Properties;
    }

    /**
     * Properties of a FileTransfer.
     * @deprecated Use hbb.FileTransfer.$Properties instead.
     */
    interface IFileTransfer extends hbb.FileTransfer.$Properties {
    }

    /** Represents a FileTransfer. */
    class FileTransfer {

        /**
         * Constructs a new FileTransfer.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransfer.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransfer dir. */
        dir: string;

        /** FileTransfer showHidden. */
        showHidden: boolean;

        /**
         * Creates a new FileTransfer instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransfer instance
         */
        static create(properties: hbb.FileTransfer.$Shape): hbb.FileTransfer & hbb.FileTransfer.$Shape;
        static create(properties?: hbb.FileTransfer.$Properties): hbb.FileTransfer;

        /**
         * Encodes the specified FileTransfer message. Does not implicitly {@link hbb.FileTransfer.verify|verify} messages.
         * @param message FileTransfer message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransfer.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransfer message, length delimited. Does not implicitly {@link hbb.FileTransfer.verify|verify} messages.
         * @param message FileTransfer message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransfer.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransfer message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransfer & hbb.FileTransfer.$Shape} FileTransfer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransfer & hbb.FileTransfer.$Shape;

        /**
         * Decodes a FileTransfer message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransfer & hbb.FileTransfer.$Shape} FileTransfer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransfer & hbb.FileTransfer.$Shape;

        /**
         * Verifies a FileTransfer message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransfer message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransfer
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransfer;

        /**
         * Creates a plain object from a FileTransfer message. Also converts values to other types if specified.
         * @param message FileTransfer
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransfer, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransfer to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransfer
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransfer {

        /** Properties of a FileTransfer. */
        interface $Properties {

            /** FileTransfer dir */
            dir?: (string|null);

            /** FileTransfer showHidden */
            showHidden?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransfer. */
        type $Shape = hbb.FileTransfer.$Properties;
    }

    /**
     * Properties of a ViewCamera.
     * @deprecated Use hbb.ViewCamera.$Properties instead.
     */
    interface IViewCamera extends hbb.ViewCamera.$Properties {
    }

    /** Represents a ViewCamera. */
    class ViewCamera {

        /**
         * Constructs a new ViewCamera.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ViewCamera.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /**
         * Creates a new ViewCamera instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ViewCamera instance
         */
        static create(properties: hbb.ViewCamera.$Shape): hbb.ViewCamera & hbb.ViewCamera.$Shape;
        static create(properties?: hbb.ViewCamera.$Properties): hbb.ViewCamera;

        /**
         * Encodes the specified ViewCamera message. Does not implicitly {@link hbb.ViewCamera.verify|verify} messages.
         * @param message ViewCamera message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ViewCamera.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ViewCamera message, length delimited. Does not implicitly {@link hbb.ViewCamera.verify|verify} messages.
         * @param message ViewCamera message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ViewCamera.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ViewCamera message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ViewCamera & hbb.ViewCamera.$Shape} ViewCamera
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ViewCamera & hbb.ViewCamera.$Shape;

        /**
         * Decodes a ViewCamera message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ViewCamera & hbb.ViewCamera.$Shape} ViewCamera
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ViewCamera & hbb.ViewCamera.$Shape;

        /**
         * Verifies a ViewCamera message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ViewCamera message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ViewCamera
         */
        static fromObject(object: { [k: string]: any }): hbb.ViewCamera;

        /**
         * Creates a plain object from a ViewCamera message. Also converts values to other types if specified.
         * @param message ViewCamera
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ViewCamera, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ViewCamera to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ViewCamera
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ViewCamera {

        /** Properties of a ViewCamera. */
        interface $Properties {

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ViewCamera. */
        type $Shape = hbb.ViewCamera.$Properties;
    }

    /**
     * Properties of a OSLogin.
     * @deprecated Use hbb.OSLogin.$Properties instead.
     */
    interface IOSLogin extends hbb.OSLogin.$Properties {
    }

    /** Represents a OSLogin. */
    class OSLogin {

        /**
         * Constructs a new OSLogin.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.OSLogin.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** OSLogin username. */
        username: string;

        /** OSLogin password. */
        password: string;

        /**
         * Creates a new OSLogin instance using the specified properties.
         * @param [properties] Properties to set
         * @returns OSLogin instance
         */
        static create(properties: hbb.OSLogin.$Shape): hbb.OSLogin & hbb.OSLogin.$Shape;
        static create(properties?: hbb.OSLogin.$Properties): hbb.OSLogin;

        /**
         * Encodes the specified OSLogin message. Does not implicitly {@link hbb.OSLogin.verify|verify} messages.
         * @param message OSLogin message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.OSLogin.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified OSLogin message, length delimited. Does not implicitly {@link hbb.OSLogin.verify|verify} messages.
         * @param message OSLogin message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.OSLogin.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a OSLogin message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.OSLogin & hbb.OSLogin.$Shape} OSLogin
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.OSLogin & hbb.OSLogin.$Shape;

        /**
         * Decodes a OSLogin message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.OSLogin & hbb.OSLogin.$Shape} OSLogin
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.OSLogin & hbb.OSLogin.$Shape;

        /**
         * Verifies a OSLogin message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a OSLogin message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns OSLogin
         */
        static fromObject(object: { [k: string]: any }): hbb.OSLogin;

        /**
         * Creates a plain object from a OSLogin message. Also converts values to other types if specified.
         * @param message OSLogin
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.OSLogin, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this OSLogin to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for OSLogin
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace OSLogin {

        /** Properties of a OSLogin. */
        interface $Properties {

            /** OSLogin username */
            username?: (string|null);

            /** OSLogin password */
            password?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a OSLogin. */
        type $Shape = hbb.OSLogin.$Properties;
    }

    /**
     * Properties of a LoginRequest.
     * @deprecated Use hbb.LoginRequest.$Properties instead.
     */
    interface ILoginRequest extends hbb.LoginRequest.$Properties {
    }

    /** Represents a LoginRequest. */
    class LoginRequest {

        /**
         * Constructs a new LoginRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.LoginRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** LoginRequest username. */
        username: string;

        /** LoginRequest password. */
        password: Uint8Array;

        /** LoginRequest myId. */
        myId: string;

        /** LoginRequest myName. */
        myName: string;

        /** LoginRequest option. */
        option?: (hbb.OptionMessage.$Properties|null);

        /** LoginRequest fileTransfer. */
        fileTransfer?: (hbb.FileTransfer.$Properties|null);

        /** LoginRequest portForward. */
        portForward?: (hbb.PortForward.$Properties|null);

        /** LoginRequest viewCamera. */
        viewCamera?: (hbb.ViewCamera.$Properties|null);

        /** LoginRequest terminal. */
        terminal?: (hbb.Terminal.$Properties|null);

        /** LoginRequest videoAckRequired. */
        videoAckRequired: boolean;

        /** LoginRequest sessionId. */
        sessionId: (number|Long);

        /** LoginRequest version. */
        version: string;

        /** LoginRequest osLogin. */
        osLogin?: (hbb.OSLogin.$Properties|null);

        /** LoginRequest myPlatform. */
        myPlatform: string;

        /** LoginRequest hwid. */
        hwid: Uint8Array;

        /** LoginRequest union. */
        union?: ("fileTransfer"|"portForward"|"viewCamera"|"terminal");

        /**
         * Creates a new LoginRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns LoginRequest instance
         */
        static create(properties: hbb.LoginRequest.$Shape): hbb.LoginRequest & hbb.LoginRequest.$Shape;
        static create(properties?: hbb.LoginRequest.$Properties): hbb.LoginRequest;

        /**
         * Encodes the specified LoginRequest message. Does not implicitly {@link hbb.LoginRequest.verify|verify} messages.
         * @param message LoginRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.LoginRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified LoginRequest message, length delimited. Does not implicitly {@link hbb.LoginRequest.verify|verify} messages.
         * @param message LoginRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.LoginRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LoginRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.LoginRequest & hbb.LoginRequest.$Shape} LoginRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.LoginRequest & hbb.LoginRequest.$Shape;

        /**
         * Decodes a LoginRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.LoginRequest & hbb.LoginRequest.$Shape} LoginRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.LoginRequest & hbb.LoginRequest.$Shape;

        /**
         * Verifies a LoginRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a LoginRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns LoginRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.LoginRequest;

        /**
         * Creates a plain object from a LoginRequest message. Also converts values to other types if specified.
         * @param message LoginRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.LoginRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this LoginRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for LoginRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace LoginRequest {

        /** Properties of a LoginRequest. */
        interface $Properties {

            /** LoginRequest username */
            username?: (string|null);

            /** LoginRequest password */
            password?: (Uint8Array|null);

            /** LoginRequest myId */
            myId?: (string|null);

            /** LoginRequest myName */
            myName?: (string|null);

            /** LoginRequest option */
            option?: (hbb.OptionMessage.$Properties|null);

            /** LoginRequest fileTransfer */
            fileTransfer?: (hbb.FileTransfer.$Properties|null);

            /** LoginRequest portForward */
            portForward?: (hbb.PortForward.$Properties|null);

            /** LoginRequest viewCamera */
            viewCamera?: (hbb.ViewCamera.$Properties|null);

            /** LoginRequest terminal */
            terminal?: (hbb.Terminal.$Properties|null);

            /** LoginRequest videoAckRequired */
            videoAckRequired?: (boolean|null);

            /** LoginRequest sessionId */
            sessionId?: (number|Long|null);

            /** LoginRequest version */
            version?: (string|null);

            /** LoginRequest osLogin */
            osLogin?: (hbb.OSLogin.$Properties|null);

            /** LoginRequest myPlatform */
            myPlatform?: (string|null);

            /** LoginRequest hwid */
            hwid?: (Uint8Array|null);

            /** LoginRequest union */
            union?: ("fileTransfer"|"portForward"|"viewCamera"|"terminal");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a LoginRequest. */
        type $Shape = {
          username?: string|null;
          password?: Uint8Array|null;
          myId?: string|null;
          myName?: string|null;
          option?: hbb.OptionMessage.$Shape|null;
          fileTransfer?: hbb.FileTransfer.$Shape|null;
          portForward?: hbb.PortForward.$Shape|null;
          viewCamera?: hbb.ViewCamera.$Shape|null;
          terminal?: hbb.Terminal.$Shape|null;
          videoAckRequired?: boolean|null;
          sessionId?: number|Long|null;
          version?: string|null;
          osLogin?: hbb.OSLogin.$Shape|null;
          myPlatform?: string|null;
          hwid?: Uint8Array|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; fileTransfer?: null; portForward?: null; viewCamera?: null; terminal?: null }|{ union?: "fileTransfer"; fileTransfer: hbb.FileTransfer.$Shape; portForward?: null; viewCamera?: null; terminal?: null }|{ union?: "portForward"; fileTransfer?: null; portForward: hbb.PortForward.$Shape; viewCamera?: null; terminal?: null }|{ union?: "viewCamera"; fileTransfer?: null; portForward?: null; viewCamera: hbb.ViewCamera.$Shape; terminal?: null }|{ union?: "terminal"; fileTransfer?: null; portForward?: null; viewCamera?: null; terminal: hbb.Terminal.$Shape })
        );
    }

    /**
     * Properties of a Terminal.
     * @deprecated Use hbb.Terminal.$Properties instead.
     */
    interface ITerminal extends hbb.Terminal.$Properties {
    }

    /** Represents a Terminal. */
    class Terminal {

        /**
         * Constructs a new Terminal.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Terminal.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Terminal serviceId. */
        serviceId: string;

        /**
         * Creates a new Terminal instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Terminal instance
         */
        static create(properties: hbb.Terminal.$Shape): hbb.Terminal & hbb.Terminal.$Shape;
        static create(properties?: hbb.Terminal.$Properties): hbb.Terminal;

        /**
         * Encodes the specified Terminal message. Does not implicitly {@link hbb.Terminal.verify|verify} messages.
         * @param message Terminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Terminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Terminal message, length delimited. Does not implicitly {@link hbb.Terminal.verify|verify} messages.
         * @param message Terminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Terminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Terminal message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Terminal & hbb.Terminal.$Shape} Terminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Terminal & hbb.Terminal.$Shape;

        /**
         * Decodes a Terminal message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Terminal & hbb.Terminal.$Shape} Terminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Terminal & hbb.Terminal.$Shape;

        /**
         * Verifies a Terminal message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Terminal message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Terminal
         */
        static fromObject(object: { [k: string]: any }): hbb.Terminal;

        /**
         * Creates a plain object from a Terminal message. Also converts values to other types if specified.
         * @param message Terminal
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Terminal, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Terminal to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Terminal
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Terminal {

        /** Properties of a Terminal. */
        interface $Properties {

            /** Terminal serviceId */
            serviceId?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a Terminal. */
        type $Shape = hbb.Terminal.$Properties;
    }

    /**
     * Properties of an Auth2FA.
     * @deprecated Use hbb.Auth2FA.$Properties instead.
     */
    interface IAuth2FA extends hbb.Auth2FA.$Properties {
    }

    /** Represents an Auth2FA. */
    class Auth2FA {

        /**
         * Constructs a new Auth2FA.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Auth2FA.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Auth2FA code. */
        code: string;

        /** Auth2FA hwid. */
        hwid: Uint8Array;

        /**
         * Creates a new Auth2FA instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Auth2FA instance
         */
        static create(properties: hbb.Auth2FA.$Shape): hbb.Auth2FA & hbb.Auth2FA.$Shape;
        static create(properties?: hbb.Auth2FA.$Properties): hbb.Auth2FA;

        /**
         * Encodes the specified Auth2FA message. Does not implicitly {@link hbb.Auth2FA.verify|verify} messages.
         * @param message Auth2FA message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Auth2FA.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Auth2FA message, length delimited. Does not implicitly {@link hbb.Auth2FA.verify|verify} messages.
         * @param message Auth2FA message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Auth2FA.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an Auth2FA message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Auth2FA & hbb.Auth2FA.$Shape} Auth2FA
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Auth2FA & hbb.Auth2FA.$Shape;

        /**
         * Decodes an Auth2FA message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Auth2FA & hbb.Auth2FA.$Shape} Auth2FA
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Auth2FA & hbb.Auth2FA.$Shape;

        /**
         * Verifies an Auth2FA message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an Auth2FA message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Auth2FA
         */
        static fromObject(object: { [k: string]: any }): hbb.Auth2FA;

        /**
         * Creates a plain object from an Auth2FA message. Also converts values to other types if specified.
         * @param message Auth2FA
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Auth2FA, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Auth2FA to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Auth2FA
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Auth2FA {

        /** Properties of an Auth2FA. */
        interface $Properties {

            /** Auth2FA code */
            code?: (string|null);

            /** Auth2FA hwid */
            hwid?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an Auth2FA. */
        type $Shape = hbb.Auth2FA.$Properties;
    }

    /**
     * Properties of a ChatMessage.
     * @deprecated Use hbb.ChatMessage.$Properties instead.
     */
    interface IChatMessage extends hbb.ChatMessage.$Properties {
    }

    /** Represents a ChatMessage. */
    class ChatMessage {

        /**
         * Constructs a new ChatMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ChatMessage.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ChatMessage text. */
        text: string;

        /**
         * Creates a new ChatMessage instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ChatMessage instance
         */
        static create(properties: hbb.ChatMessage.$Shape): hbb.ChatMessage & hbb.ChatMessage.$Shape;
        static create(properties?: hbb.ChatMessage.$Properties): hbb.ChatMessage;

        /**
         * Encodes the specified ChatMessage message. Does not implicitly {@link hbb.ChatMessage.verify|verify} messages.
         * @param message ChatMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ChatMessage.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ChatMessage message, length delimited. Does not implicitly {@link hbb.ChatMessage.verify|verify} messages.
         * @param message ChatMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ChatMessage.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ChatMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ChatMessage & hbb.ChatMessage.$Shape} ChatMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ChatMessage & hbb.ChatMessage.$Shape;

        /**
         * Decodes a ChatMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ChatMessage & hbb.ChatMessage.$Shape} ChatMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ChatMessage & hbb.ChatMessage.$Shape;

        /**
         * Verifies a ChatMessage message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ChatMessage message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ChatMessage
         */
        static fromObject(object: { [k: string]: any }): hbb.ChatMessage;

        /**
         * Creates a plain object from a ChatMessage message. Also converts values to other types if specified.
         * @param message ChatMessage
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ChatMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ChatMessage to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ChatMessage
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ChatMessage {

        /** Properties of a ChatMessage. */
        interface $Properties {

            /** ChatMessage text */
            text?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ChatMessage. */
        type $Shape = hbb.ChatMessage.$Properties;
    }

    /**
     * Properties of a Features.
     * @deprecated Use hbb.Features.$Properties instead.
     */
    interface IFeatures extends hbb.Features.$Properties {
    }

    /** Represents a Features. */
    class Features {

        /**
         * Constructs a new Features.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Features.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Features privacyMode. */
        privacyMode: boolean;

        /** Features terminal. */
        terminal: boolean;

        /**
         * Creates a new Features instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Features instance
         */
        static create(properties: hbb.Features.$Shape): hbb.Features & hbb.Features.$Shape;
        static create(properties?: hbb.Features.$Properties): hbb.Features;

        /**
         * Encodes the specified Features message. Does not implicitly {@link hbb.Features.verify|verify} messages.
         * @param message Features message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Features.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Features message, length delimited. Does not implicitly {@link hbb.Features.verify|verify} messages.
         * @param message Features message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Features.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Features message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Features & hbb.Features.$Shape} Features
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Features & hbb.Features.$Shape;

        /**
         * Decodes a Features message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Features & hbb.Features.$Shape} Features
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Features & hbb.Features.$Shape;

        /**
         * Verifies a Features message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Features message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Features
         */
        static fromObject(object: { [k: string]: any }): hbb.Features;

        /**
         * Creates a plain object from a Features message. Also converts values to other types if specified.
         * @param message Features
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Features, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Features to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Features
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Features {

        /** Properties of a Features. */
        interface $Properties {

            /** Features privacyMode */
            privacyMode?: (boolean|null);

            /** Features terminal */
            terminal?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a Features. */
        type $Shape = hbb.Features.$Properties;
    }

    /**
     * Properties of a CodecAbility.
     * @deprecated Use hbb.CodecAbility.$Properties instead.
     */
    interface ICodecAbility extends hbb.CodecAbility.$Properties {
    }

    /** Represents a CodecAbility. */
    class CodecAbility {

        /**
         * Constructs a new CodecAbility.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CodecAbility.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CodecAbility vp8. */
        vp8: boolean;

        /** CodecAbility vp9. */
        vp9: boolean;

        /** CodecAbility av1. */
        av1: boolean;

        /** CodecAbility h264. */
        h264: boolean;

        /** CodecAbility h265. */
        h265: boolean;

        /**
         * Creates a new CodecAbility instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CodecAbility instance
         */
        static create(properties: hbb.CodecAbility.$Shape): hbb.CodecAbility & hbb.CodecAbility.$Shape;
        static create(properties?: hbb.CodecAbility.$Properties): hbb.CodecAbility;

        /**
         * Encodes the specified CodecAbility message. Does not implicitly {@link hbb.CodecAbility.verify|verify} messages.
         * @param message CodecAbility message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CodecAbility.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CodecAbility message, length delimited. Does not implicitly {@link hbb.CodecAbility.verify|verify} messages.
         * @param message CodecAbility message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CodecAbility.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CodecAbility message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CodecAbility & hbb.CodecAbility.$Shape} CodecAbility
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CodecAbility & hbb.CodecAbility.$Shape;

        /**
         * Decodes a CodecAbility message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CodecAbility & hbb.CodecAbility.$Shape} CodecAbility
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CodecAbility & hbb.CodecAbility.$Shape;

        /**
         * Verifies a CodecAbility message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CodecAbility message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CodecAbility
         */
        static fromObject(object: { [k: string]: any }): hbb.CodecAbility;

        /**
         * Creates a plain object from a CodecAbility message. Also converts values to other types if specified.
         * @param message CodecAbility
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CodecAbility, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CodecAbility to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CodecAbility
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CodecAbility {

        /** Properties of a CodecAbility. */
        interface $Properties {

            /** CodecAbility vp8 */
            vp8?: (boolean|null);

            /** CodecAbility vp9 */
            vp9?: (boolean|null);

            /** CodecAbility av1 */
            av1?: (boolean|null);

            /** CodecAbility h264 */
            h264?: (boolean|null);

            /** CodecAbility h265 */
            h265?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CodecAbility. */
        type $Shape = hbb.CodecAbility.$Properties;
    }

    /**
     * Properties of a SupportedEncoding.
     * @deprecated Use hbb.SupportedEncoding.$Properties instead.
     */
    interface ISupportedEncoding extends hbb.SupportedEncoding.$Properties {
    }

    /** Represents a SupportedEncoding. */
    class SupportedEncoding {

        /**
         * Constructs a new SupportedEncoding.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SupportedEncoding.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SupportedEncoding h264. */
        h264: boolean;

        /** SupportedEncoding h265. */
        h265: boolean;

        /** SupportedEncoding vp8. */
        vp8: boolean;

        /** SupportedEncoding av1. */
        av1: boolean;

        /** SupportedEncoding i444. */
        i444?: (hbb.CodecAbility.$Properties|null);

        /**
         * Creates a new SupportedEncoding instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SupportedEncoding instance
         */
        static create(properties: hbb.SupportedEncoding.$Shape): hbb.SupportedEncoding & hbb.SupportedEncoding.$Shape;
        static create(properties?: hbb.SupportedEncoding.$Properties): hbb.SupportedEncoding;

        /**
         * Encodes the specified SupportedEncoding message. Does not implicitly {@link hbb.SupportedEncoding.verify|verify} messages.
         * @param message SupportedEncoding message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SupportedEncoding.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SupportedEncoding message, length delimited. Does not implicitly {@link hbb.SupportedEncoding.verify|verify} messages.
         * @param message SupportedEncoding message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SupportedEncoding.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SupportedEncoding message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SupportedEncoding & hbb.SupportedEncoding.$Shape} SupportedEncoding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SupportedEncoding & hbb.SupportedEncoding.$Shape;

        /**
         * Decodes a SupportedEncoding message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SupportedEncoding & hbb.SupportedEncoding.$Shape} SupportedEncoding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SupportedEncoding & hbb.SupportedEncoding.$Shape;

        /**
         * Verifies a SupportedEncoding message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SupportedEncoding message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SupportedEncoding
         */
        static fromObject(object: { [k: string]: any }): hbb.SupportedEncoding;

        /**
         * Creates a plain object from a SupportedEncoding message. Also converts values to other types if specified.
         * @param message SupportedEncoding
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SupportedEncoding, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SupportedEncoding to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SupportedEncoding
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SupportedEncoding {

        /** Properties of a SupportedEncoding. */
        interface $Properties {

            /** SupportedEncoding h264 */
            h264?: (boolean|null);

            /** SupportedEncoding h265 */
            h265?: (boolean|null);

            /** SupportedEncoding vp8 */
            vp8?: (boolean|null);

            /** SupportedEncoding av1 */
            av1?: (boolean|null);

            /** SupportedEncoding i444 */
            i444?: (hbb.CodecAbility.$Properties|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SupportedEncoding. */
        type $Shape = hbb.SupportedEncoding.$Properties;
    }

    /**
     * Properties of a PeerInfo.
     * @deprecated Use hbb.PeerInfo.$Properties instead.
     */
    interface IPeerInfo extends hbb.PeerInfo.$Properties {
    }

    /** Represents a PeerInfo. */
    class PeerInfo {

        /**
         * Constructs a new PeerInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PeerInfo.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PeerInfo username. */
        username: string;

        /** PeerInfo hostname. */
        hostname: string;

        /** PeerInfo platform. */
        platform: string;

        /** PeerInfo displays. */
        displays: hbb.DisplayInfo.$Properties[];

        /** PeerInfo currentDisplay. */
        currentDisplay: number;

        /** PeerInfo sasEnabled. */
        sasEnabled: boolean;

        /** PeerInfo version. */
        version: string;

        /** PeerInfo features. */
        features?: (hbb.Features.$Properties|null);

        /** PeerInfo encoding. */
        encoding?: (hbb.SupportedEncoding.$Properties|null);

        /** PeerInfo resolutions. */
        resolutions?: (hbb.SupportedResolutions.$Properties|null);

        /** PeerInfo platformAdditions. */
        platformAdditions: string;

        /** PeerInfo windowsSessions. */
        windowsSessions?: (hbb.WindowsSessions.$Properties|null);

        /**
         * Creates a new PeerInfo instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PeerInfo instance
         */
        static create(properties: hbb.PeerInfo.$Shape): hbb.PeerInfo & hbb.PeerInfo.$Shape;
        static create(properties?: hbb.PeerInfo.$Properties): hbb.PeerInfo;

        /**
         * Encodes the specified PeerInfo message. Does not implicitly {@link hbb.PeerInfo.verify|verify} messages.
         * @param message PeerInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PeerInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PeerInfo message, length delimited. Does not implicitly {@link hbb.PeerInfo.verify|verify} messages.
         * @param message PeerInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PeerInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PeerInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PeerInfo & hbb.PeerInfo.$Shape} PeerInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PeerInfo & hbb.PeerInfo.$Shape;

        /**
         * Decodes a PeerInfo message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PeerInfo & hbb.PeerInfo.$Shape} PeerInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PeerInfo & hbb.PeerInfo.$Shape;

        /**
         * Verifies a PeerInfo message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PeerInfo message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PeerInfo
         */
        static fromObject(object: { [k: string]: any }): hbb.PeerInfo;

        /**
         * Creates a plain object from a PeerInfo message. Also converts values to other types if specified.
         * @param message PeerInfo
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PeerInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PeerInfo to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PeerInfo
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PeerInfo {

        /** Properties of a PeerInfo. */
        interface $Properties {

            /** PeerInfo username */
            username?: (string|null);

            /** PeerInfo hostname */
            hostname?: (string|null);

            /** PeerInfo platform */
            platform?: (string|null);

            /** PeerInfo displays */
            displays?: (hbb.DisplayInfo.$Properties[]|null);

            /** PeerInfo currentDisplay */
            currentDisplay?: (number|null);

            /** PeerInfo sasEnabled */
            sasEnabled?: (boolean|null);

            /** PeerInfo version */
            version?: (string|null);

            /** PeerInfo features */
            features?: (hbb.Features.$Properties|null);

            /** PeerInfo encoding */
            encoding?: (hbb.SupportedEncoding.$Properties|null);

            /** PeerInfo resolutions */
            resolutions?: (hbb.SupportedResolutions.$Properties|null);

            /** PeerInfo platformAdditions */
            platformAdditions?: (string|null);

            /** PeerInfo windowsSessions */
            windowsSessions?: (hbb.WindowsSessions.$Properties|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PeerInfo. */
        type $Shape = hbb.PeerInfo.$Properties;
    }

    /**
     * Properties of a WindowsSession.
     * @deprecated Use hbb.WindowsSession.$Properties instead.
     */
    interface IWindowsSession extends hbb.WindowsSession.$Properties {
    }

    /** Represents a WindowsSession. */
    class WindowsSession {

        /**
         * Constructs a new WindowsSession.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.WindowsSession.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** WindowsSession sid. */
        sid: number;

        /** WindowsSession name. */
        name: string;

        /**
         * Creates a new WindowsSession instance using the specified properties.
         * @param [properties] Properties to set
         * @returns WindowsSession instance
         */
        static create(properties: hbb.WindowsSession.$Shape): hbb.WindowsSession & hbb.WindowsSession.$Shape;
        static create(properties?: hbb.WindowsSession.$Properties): hbb.WindowsSession;

        /**
         * Encodes the specified WindowsSession message. Does not implicitly {@link hbb.WindowsSession.verify|verify} messages.
         * @param message WindowsSession message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.WindowsSession.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified WindowsSession message, length delimited. Does not implicitly {@link hbb.WindowsSession.verify|verify} messages.
         * @param message WindowsSession message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.WindowsSession.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a WindowsSession message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.WindowsSession & hbb.WindowsSession.$Shape} WindowsSession
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.WindowsSession & hbb.WindowsSession.$Shape;

        /**
         * Decodes a WindowsSession message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.WindowsSession & hbb.WindowsSession.$Shape} WindowsSession
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.WindowsSession & hbb.WindowsSession.$Shape;

        /**
         * Verifies a WindowsSession message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a WindowsSession message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns WindowsSession
         */
        static fromObject(object: { [k: string]: any }): hbb.WindowsSession;

        /**
         * Creates a plain object from a WindowsSession message. Also converts values to other types if specified.
         * @param message WindowsSession
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.WindowsSession, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this WindowsSession to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for WindowsSession
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace WindowsSession {

        /** Properties of a WindowsSession. */
        interface $Properties {

            /** WindowsSession sid */
            sid?: (number|null);

            /** WindowsSession name */
            name?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a WindowsSession. */
        type $Shape = hbb.WindowsSession.$Properties;
    }

    /**
     * Properties of a LoginResponse.
     * @deprecated Use hbb.LoginResponse.$Properties instead.
     */
    interface ILoginResponse extends hbb.LoginResponse.$Properties {
    }

    /** Represents a LoginResponse. */
    class LoginResponse {

        /**
         * Constructs a new LoginResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.LoginResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** LoginResponse error. */
        error?: (string|null);

        /** LoginResponse peerInfo. */
        peerInfo?: (hbb.PeerInfo.$Properties|null);

        /** LoginResponse enableTrustedDevices. */
        enableTrustedDevices: boolean;

        /** LoginResponse union. */
        union?: ("error"|"peerInfo");

        /**
         * Creates a new LoginResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns LoginResponse instance
         */
        static create(properties: hbb.LoginResponse.$Shape): hbb.LoginResponse & hbb.LoginResponse.$Shape;
        static create(properties?: hbb.LoginResponse.$Properties): hbb.LoginResponse;

        /**
         * Encodes the specified LoginResponse message. Does not implicitly {@link hbb.LoginResponse.verify|verify} messages.
         * @param message LoginResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.LoginResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified LoginResponse message, length delimited. Does not implicitly {@link hbb.LoginResponse.verify|verify} messages.
         * @param message LoginResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.LoginResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LoginResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.LoginResponse & hbb.LoginResponse.$Shape} LoginResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.LoginResponse & hbb.LoginResponse.$Shape;

        /**
         * Decodes a LoginResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.LoginResponse & hbb.LoginResponse.$Shape} LoginResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.LoginResponse & hbb.LoginResponse.$Shape;

        /**
         * Verifies a LoginResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a LoginResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns LoginResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.LoginResponse;

        /**
         * Creates a plain object from a LoginResponse message. Also converts values to other types if specified.
         * @param message LoginResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.LoginResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this LoginResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for LoginResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace LoginResponse {

        /** Properties of a LoginResponse. */
        interface $Properties {

            /** LoginResponse error */
            error?: (string|null);

            /** LoginResponse peerInfo */
            peerInfo?: (hbb.PeerInfo.$Properties|null);

            /** LoginResponse enableTrustedDevices */
            enableTrustedDevices?: (boolean|null);

            /** LoginResponse union */
            union?: ("error"|"peerInfo");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a LoginResponse. */
        type $Shape = {
          error?: string|null;
          peerInfo?: hbb.PeerInfo.$Shape|null;
          enableTrustedDevices?: boolean|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; error?: null; peerInfo?: null }|{ union?: "error"; error: string; peerInfo?: null }|{ union?: "peerInfo"; error?: null; peerInfo: hbb.PeerInfo.$Shape })
        );
    }

    /**
     * Properties of a TouchScaleUpdate.
     * @deprecated Use hbb.TouchScaleUpdate.$Properties instead.
     */
    interface ITouchScaleUpdate extends hbb.TouchScaleUpdate.$Properties {
    }

    /** Represents a TouchScaleUpdate. */
    class TouchScaleUpdate {

        /**
         * Constructs a new TouchScaleUpdate.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TouchScaleUpdate.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TouchScaleUpdate scale. */
        scale: number;

        /**
         * Creates a new TouchScaleUpdate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TouchScaleUpdate instance
         */
        static create(properties: hbb.TouchScaleUpdate.$Shape): hbb.TouchScaleUpdate & hbb.TouchScaleUpdate.$Shape;
        static create(properties?: hbb.TouchScaleUpdate.$Properties): hbb.TouchScaleUpdate;

        /**
         * Encodes the specified TouchScaleUpdate message. Does not implicitly {@link hbb.TouchScaleUpdate.verify|verify} messages.
         * @param message TouchScaleUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TouchScaleUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TouchScaleUpdate message, length delimited. Does not implicitly {@link hbb.TouchScaleUpdate.verify|verify} messages.
         * @param message TouchScaleUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TouchScaleUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TouchScaleUpdate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TouchScaleUpdate & hbb.TouchScaleUpdate.$Shape} TouchScaleUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TouchScaleUpdate & hbb.TouchScaleUpdate.$Shape;

        /**
         * Decodes a TouchScaleUpdate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TouchScaleUpdate & hbb.TouchScaleUpdate.$Shape} TouchScaleUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TouchScaleUpdate & hbb.TouchScaleUpdate.$Shape;

        /**
         * Verifies a TouchScaleUpdate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TouchScaleUpdate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TouchScaleUpdate
         */
        static fromObject(object: { [k: string]: any }): hbb.TouchScaleUpdate;

        /**
         * Creates a plain object from a TouchScaleUpdate message. Also converts values to other types if specified.
         * @param message TouchScaleUpdate
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TouchScaleUpdate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TouchScaleUpdate to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TouchScaleUpdate
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TouchScaleUpdate {

        /** Properties of a TouchScaleUpdate. */
        interface $Properties {

            /** TouchScaleUpdate scale */
            scale?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TouchScaleUpdate. */
        type $Shape = hbb.TouchScaleUpdate.$Properties;
    }

    /**
     * Properties of a TouchPanStart.
     * @deprecated Use hbb.TouchPanStart.$Properties instead.
     */
    interface ITouchPanStart extends hbb.TouchPanStart.$Properties {
    }

    /** Represents a TouchPanStart. */
    class TouchPanStart {

        /**
         * Constructs a new TouchPanStart.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TouchPanStart.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TouchPanStart x. */
        x: number;

        /** TouchPanStart y. */
        y: number;

        /**
         * Creates a new TouchPanStart instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TouchPanStart instance
         */
        static create(properties: hbb.TouchPanStart.$Shape): hbb.TouchPanStart & hbb.TouchPanStart.$Shape;
        static create(properties?: hbb.TouchPanStart.$Properties): hbb.TouchPanStart;

        /**
         * Encodes the specified TouchPanStart message. Does not implicitly {@link hbb.TouchPanStart.verify|verify} messages.
         * @param message TouchPanStart message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TouchPanStart.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TouchPanStart message, length delimited. Does not implicitly {@link hbb.TouchPanStart.verify|verify} messages.
         * @param message TouchPanStart message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TouchPanStart.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TouchPanStart message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TouchPanStart & hbb.TouchPanStart.$Shape} TouchPanStart
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TouchPanStart & hbb.TouchPanStart.$Shape;

        /**
         * Decodes a TouchPanStart message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TouchPanStart & hbb.TouchPanStart.$Shape} TouchPanStart
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TouchPanStart & hbb.TouchPanStart.$Shape;

        /**
         * Verifies a TouchPanStart message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TouchPanStart message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TouchPanStart
         */
        static fromObject(object: { [k: string]: any }): hbb.TouchPanStart;

        /**
         * Creates a plain object from a TouchPanStart message. Also converts values to other types if specified.
         * @param message TouchPanStart
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TouchPanStart, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TouchPanStart to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TouchPanStart
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TouchPanStart {

        /** Properties of a TouchPanStart. */
        interface $Properties {

            /** TouchPanStart x */
            x?: (number|null);

            /** TouchPanStart y */
            y?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TouchPanStart. */
        type $Shape = hbb.TouchPanStart.$Properties;
    }

    /**
     * Properties of a TouchPanUpdate.
     * @deprecated Use hbb.TouchPanUpdate.$Properties instead.
     */
    interface ITouchPanUpdate extends hbb.TouchPanUpdate.$Properties {
    }

    /** Represents a TouchPanUpdate. */
    class TouchPanUpdate {

        /**
         * Constructs a new TouchPanUpdate.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TouchPanUpdate.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TouchPanUpdate x. */
        x: number;

        /** TouchPanUpdate y. */
        y: number;

        /**
         * Creates a new TouchPanUpdate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TouchPanUpdate instance
         */
        static create(properties: hbb.TouchPanUpdate.$Shape): hbb.TouchPanUpdate & hbb.TouchPanUpdate.$Shape;
        static create(properties?: hbb.TouchPanUpdate.$Properties): hbb.TouchPanUpdate;

        /**
         * Encodes the specified TouchPanUpdate message. Does not implicitly {@link hbb.TouchPanUpdate.verify|verify} messages.
         * @param message TouchPanUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TouchPanUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TouchPanUpdate message, length delimited. Does not implicitly {@link hbb.TouchPanUpdate.verify|verify} messages.
         * @param message TouchPanUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TouchPanUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TouchPanUpdate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TouchPanUpdate & hbb.TouchPanUpdate.$Shape} TouchPanUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TouchPanUpdate & hbb.TouchPanUpdate.$Shape;

        /**
         * Decodes a TouchPanUpdate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TouchPanUpdate & hbb.TouchPanUpdate.$Shape} TouchPanUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TouchPanUpdate & hbb.TouchPanUpdate.$Shape;

        /**
         * Verifies a TouchPanUpdate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TouchPanUpdate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TouchPanUpdate
         */
        static fromObject(object: { [k: string]: any }): hbb.TouchPanUpdate;

        /**
         * Creates a plain object from a TouchPanUpdate message. Also converts values to other types if specified.
         * @param message TouchPanUpdate
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TouchPanUpdate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TouchPanUpdate to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TouchPanUpdate
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TouchPanUpdate {

        /** Properties of a TouchPanUpdate. */
        interface $Properties {

            /** TouchPanUpdate x */
            x?: (number|null);

            /** TouchPanUpdate y */
            y?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TouchPanUpdate. */
        type $Shape = hbb.TouchPanUpdate.$Properties;
    }

    /**
     * Properties of a TouchPanEnd.
     * @deprecated Use hbb.TouchPanEnd.$Properties instead.
     */
    interface ITouchPanEnd extends hbb.TouchPanEnd.$Properties {
    }

    /** Represents a TouchPanEnd. */
    class TouchPanEnd {

        /**
         * Constructs a new TouchPanEnd.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TouchPanEnd.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TouchPanEnd x. */
        x: number;

        /** TouchPanEnd y. */
        y: number;

        /**
         * Creates a new TouchPanEnd instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TouchPanEnd instance
         */
        static create(properties: hbb.TouchPanEnd.$Shape): hbb.TouchPanEnd & hbb.TouchPanEnd.$Shape;
        static create(properties?: hbb.TouchPanEnd.$Properties): hbb.TouchPanEnd;

        /**
         * Encodes the specified TouchPanEnd message. Does not implicitly {@link hbb.TouchPanEnd.verify|verify} messages.
         * @param message TouchPanEnd message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TouchPanEnd.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TouchPanEnd message, length delimited. Does not implicitly {@link hbb.TouchPanEnd.verify|verify} messages.
         * @param message TouchPanEnd message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TouchPanEnd.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TouchPanEnd message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TouchPanEnd & hbb.TouchPanEnd.$Shape} TouchPanEnd
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TouchPanEnd & hbb.TouchPanEnd.$Shape;

        /**
         * Decodes a TouchPanEnd message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TouchPanEnd & hbb.TouchPanEnd.$Shape} TouchPanEnd
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TouchPanEnd & hbb.TouchPanEnd.$Shape;

        /**
         * Verifies a TouchPanEnd message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TouchPanEnd message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TouchPanEnd
         */
        static fromObject(object: { [k: string]: any }): hbb.TouchPanEnd;

        /**
         * Creates a plain object from a TouchPanEnd message. Also converts values to other types if specified.
         * @param message TouchPanEnd
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TouchPanEnd, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TouchPanEnd to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TouchPanEnd
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TouchPanEnd {

        /** Properties of a TouchPanEnd. */
        interface $Properties {

            /** TouchPanEnd x */
            x?: (number|null);

            /** TouchPanEnd y */
            y?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TouchPanEnd. */
        type $Shape = hbb.TouchPanEnd.$Properties;
    }

    /**
     * Properties of a TouchEvent.
     * @deprecated Use hbb.TouchEvent.$Properties instead.
     */
    interface ITouchEvent extends hbb.TouchEvent.$Properties {
    }

    /** Represents a TouchEvent. */
    class TouchEvent {

        /**
         * Constructs a new TouchEvent.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TouchEvent.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TouchEvent scaleUpdate. */
        scaleUpdate?: (hbb.TouchScaleUpdate.$Properties|null);

        /** TouchEvent panStart. */
        panStart?: (hbb.TouchPanStart.$Properties|null);

        /** TouchEvent panUpdate. */
        panUpdate?: (hbb.TouchPanUpdate.$Properties|null);

        /** TouchEvent panEnd. */
        panEnd?: (hbb.TouchPanEnd.$Properties|null);

        /** TouchEvent union. */
        union?: ("scaleUpdate"|"panStart"|"panUpdate"|"panEnd");

        /**
         * Creates a new TouchEvent instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TouchEvent instance
         */
        static create(properties: hbb.TouchEvent.$Shape): hbb.TouchEvent & hbb.TouchEvent.$Shape;
        static create(properties?: hbb.TouchEvent.$Properties): hbb.TouchEvent;

        /**
         * Encodes the specified TouchEvent message. Does not implicitly {@link hbb.TouchEvent.verify|verify} messages.
         * @param message TouchEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TouchEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TouchEvent message, length delimited. Does not implicitly {@link hbb.TouchEvent.verify|verify} messages.
         * @param message TouchEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TouchEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TouchEvent message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TouchEvent & hbb.TouchEvent.$Shape} TouchEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TouchEvent & hbb.TouchEvent.$Shape;

        /**
         * Decodes a TouchEvent message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TouchEvent & hbb.TouchEvent.$Shape} TouchEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TouchEvent & hbb.TouchEvent.$Shape;

        /**
         * Verifies a TouchEvent message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TouchEvent message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TouchEvent
         */
        static fromObject(object: { [k: string]: any }): hbb.TouchEvent;

        /**
         * Creates a plain object from a TouchEvent message. Also converts values to other types if specified.
         * @param message TouchEvent
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TouchEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TouchEvent to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TouchEvent
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TouchEvent {

        /** Properties of a TouchEvent. */
        interface $Properties {

            /** TouchEvent scaleUpdate */
            scaleUpdate?: (hbb.TouchScaleUpdate.$Properties|null);

            /** TouchEvent panStart */
            panStart?: (hbb.TouchPanStart.$Properties|null);

            /** TouchEvent panUpdate */
            panUpdate?: (hbb.TouchPanUpdate.$Properties|null);

            /** TouchEvent panEnd */
            panEnd?: (hbb.TouchPanEnd.$Properties|null);

            /** TouchEvent union */
            union?: ("scaleUpdate"|"panStart"|"panUpdate"|"panEnd");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a TouchEvent. */
        type $Shape = {
          scaleUpdate?: hbb.TouchScaleUpdate.$Shape|null;
          panStart?: hbb.TouchPanStart.$Shape|null;
          panUpdate?: hbb.TouchPanUpdate.$Shape|null;
          panEnd?: hbb.TouchPanEnd.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; scaleUpdate?: null; panStart?: null; panUpdate?: null; panEnd?: null }|{ union?: "scaleUpdate"; scaleUpdate: hbb.TouchScaleUpdate.$Shape; panStart?: null; panUpdate?: null; panEnd?: null }|{ union?: "panStart"; scaleUpdate?: null; panStart: hbb.TouchPanStart.$Shape; panUpdate?: null; panEnd?: null }|{ union?: "panUpdate"; scaleUpdate?: null; panStart?: null; panUpdate: hbb.TouchPanUpdate.$Shape; panEnd?: null }|{ union?: "panEnd"; scaleUpdate?: null; panStart?: null; panUpdate?: null; panEnd: hbb.TouchPanEnd.$Shape })
        );
    }

    /**
     * Properties of a PointerDeviceEvent.
     * @deprecated Use hbb.PointerDeviceEvent.$Properties instead.
     */
    interface IPointerDeviceEvent extends hbb.PointerDeviceEvent.$Properties {
    }

    /** Represents a PointerDeviceEvent. */
    class PointerDeviceEvent {

        /**
         * Constructs a new PointerDeviceEvent.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PointerDeviceEvent.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PointerDeviceEvent touchEvent. */
        touchEvent?: (hbb.TouchEvent.$Properties|null);

        /** PointerDeviceEvent modifiers. */
        modifiers: hbb.ControlKey[];

        /** PointerDeviceEvent union. */
        union?: "touchEvent";

        /**
         * Creates a new PointerDeviceEvent instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PointerDeviceEvent instance
         */
        static create(properties: hbb.PointerDeviceEvent.$Shape): hbb.PointerDeviceEvent & hbb.PointerDeviceEvent.$Shape;
        static create(properties?: hbb.PointerDeviceEvent.$Properties): hbb.PointerDeviceEvent;

        /**
         * Encodes the specified PointerDeviceEvent message. Does not implicitly {@link hbb.PointerDeviceEvent.verify|verify} messages.
         * @param message PointerDeviceEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PointerDeviceEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PointerDeviceEvent message, length delimited. Does not implicitly {@link hbb.PointerDeviceEvent.verify|verify} messages.
         * @param message PointerDeviceEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PointerDeviceEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PointerDeviceEvent message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PointerDeviceEvent & hbb.PointerDeviceEvent.$Shape} PointerDeviceEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PointerDeviceEvent & hbb.PointerDeviceEvent.$Shape;

        /**
         * Decodes a PointerDeviceEvent message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PointerDeviceEvent & hbb.PointerDeviceEvent.$Shape} PointerDeviceEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PointerDeviceEvent & hbb.PointerDeviceEvent.$Shape;

        /**
         * Verifies a PointerDeviceEvent message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PointerDeviceEvent message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PointerDeviceEvent
         */
        static fromObject(object: { [k: string]: any }): hbb.PointerDeviceEvent;

        /**
         * Creates a plain object from a PointerDeviceEvent message. Also converts values to other types if specified.
         * @param message PointerDeviceEvent
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PointerDeviceEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PointerDeviceEvent to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PointerDeviceEvent
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PointerDeviceEvent {

        /** Properties of a PointerDeviceEvent. */
        interface $Properties {

            /** PointerDeviceEvent touchEvent */
            touchEvent?: (hbb.TouchEvent.$Properties|null);

            /** PointerDeviceEvent modifiers */
            modifiers?: (hbb.ControlKey[]|null);

            /** PointerDeviceEvent union */
            union?: "touchEvent";

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a PointerDeviceEvent. */
        type $Shape = {
          touchEvent?: hbb.TouchEvent.$Shape|null;
          modifiers?: hbb.ControlKey[]|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; touchEvent?: null }|{ union?: "touchEvent"; touchEvent: hbb.TouchEvent.$Shape })
        );
    }

    /**
     * Properties of a MouseEvent.
     * @deprecated Use hbb.MouseEvent.$Properties instead.
     */
    interface IMouseEvent extends hbb.MouseEvent.$Properties {
    }

    /** Represents a MouseEvent. */
    class MouseEvent {

        /**
         * Constructs a new MouseEvent.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.MouseEvent.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** MouseEvent mask. */
        mask: number;

        /** MouseEvent x. */
        x: number;

        /** MouseEvent y. */
        y: number;

        /** MouseEvent modifiers. */
        modifiers: hbb.ControlKey[];

        /**
         * Creates a new MouseEvent instance using the specified properties.
         * @param [properties] Properties to set
         * @returns MouseEvent instance
         */
        static create(properties: hbb.MouseEvent.$Shape): hbb.MouseEvent & hbb.MouseEvent.$Shape;
        static create(properties?: hbb.MouseEvent.$Properties): hbb.MouseEvent;

        /**
         * Encodes the specified MouseEvent message. Does not implicitly {@link hbb.MouseEvent.verify|verify} messages.
         * @param message MouseEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.MouseEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified MouseEvent message, length delimited. Does not implicitly {@link hbb.MouseEvent.verify|verify} messages.
         * @param message MouseEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.MouseEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MouseEvent message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.MouseEvent & hbb.MouseEvent.$Shape} MouseEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.MouseEvent & hbb.MouseEvent.$Shape;

        /**
         * Decodes a MouseEvent message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.MouseEvent & hbb.MouseEvent.$Shape} MouseEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.MouseEvent & hbb.MouseEvent.$Shape;

        /**
         * Verifies a MouseEvent message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a MouseEvent message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns MouseEvent
         */
        static fromObject(object: { [k: string]: any }): hbb.MouseEvent;

        /**
         * Creates a plain object from a MouseEvent message. Also converts values to other types if specified.
         * @param message MouseEvent
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.MouseEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this MouseEvent to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for MouseEvent
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace MouseEvent {

        /** Properties of a MouseEvent. */
        interface $Properties {

            /** MouseEvent mask */
            mask?: (number|null);

            /** MouseEvent x */
            x?: (number|null);

            /** MouseEvent y */
            y?: (number|null);

            /** MouseEvent modifiers */
            modifiers?: (hbb.ControlKey[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a MouseEvent. */
        type $Shape = hbb.MouseEvent.$Properties;
    }

    /** KeyboardMode enum. */
    enum KeyboardMode {

        /** Legacy value */
        Legacy = 0,

        /** Map value */
        Map = 1,

        /** Translate value */
        Translate = 2,

        /** Auto value */
        Auto = 3
    }

    /** ControlKey enum. */
    enum ControlKey {

        /** Unknown value */
        Unknown = 0,

        /** Alt value */
        Alt = 1,

        /** Backspace value */
        Backspace = 2,

        /** CapsLock value */
        CapsLock = 3,

        /** Control value */
        Control = 4,

        /** Delete value */
        Delete = 5,

        /** DownArrow value */
        DownArrow = 6,

        /** End value */
        End = 7,

        /** Escape value */
        Escape = 8,

        /** F1 value */
        F1 = 9,

        /** F10 value */
        F10 = 10,

        /** F11 value */
        F11 = 11,

        /** F12 value */
        F12 = 12,

        /** F2 value */
        F2 = 13,

        /** F3 value */
        F3 = 14,

        /** F4 value */
        F4 = 15,

        /** F5 value */
        F5 = 16,

        /** F6 value */
        F6 = 17,

        /** F7 value */
        F7 = 18,

        /** F8 value */
        F8 = 19,

        /** F9 value */
        F9 = 20,

        /** Home value */
        Home = 21,

        /** LeftArrow value */
        LeftArrow = 22,

        /** meta key (also known as "windows"; "super"; and "command") */
        Meta = 23,

        /** option key on macOS (alt key on Linux and Windows) */
        Option = 24,

        /** PageDown value */
        PageDown = 25,

        /** PageUp value */
        PageUp = 26,

        /** Return value */
        Return = 27,

        /** RightArrow value */
        RightArrow = 28,

        /** Shift value */
        Shift = 29,

        /** Space value */
        Space = 30,

        /** Tab value */
        Tab = 31,

        /** UpArrow value */
        UpArrow = 32,

        /** Numpad0 value */
        Numpad0 = 33,

        /** Numpad1 value */
        Numpad1 = 34,

        /** Numpad2 value */
        Numpad2 = 35,

        /** Numpad3 value */
        Numpad3 = 36,

        /** Numpad4 value */
        Numpad4 = 37,

        /** Numpad5 value */
        Numpad5 = 38,

        /** Numpad6 value */
        Numpad6 = 39,

        /** Numpad7 value */
        Numpad7 = 40,

        /** Numpad8 value */
        Numpad8 = 41,

        /** Numpad9 value */
        Numpad9 = 42,

        /** Cancel value */
        Cancel = 43,

        /** Clear value */
        Clear = 44,

        /** Menu value */
        Menu = 45,

        /** Pause value */
        Pause = 46,

        /** Kana value */
        Kana = 47,

        /** Hangul value */
        Hangul = 48,

        /** Junja value */
        Junja = 49,

        /** Final value */
        Final = 50,

        /** Hanja value */
        Hanja = 51,

        /** Kanji value */
        Kanji = 52,

        /** Convert value */
        Convert = 53,

        /** Select value */
        Select = 54,

        /** Print value */
        Print = 55,

        /** Execute value */
        Execute = 56,

        /** Snapshot value */
        Snapshot = 57,

        /** Insert value */
        Insert = 58,

        /** Help value */
        Help = 59,

        /** Sleep value */
        Sleep = 60,

        /** Separator value */
        Separator = 61,

        /** Scroll value */
        Scroll = 62,

        /** NumLock value */
        NumLock = 63,

        /** RWin value */
        RWin = 64,

        /** Apps value */
        Apps = 65,

        /** Multiply value */
        Multiply = 66,

        /** Add value */
        Add = 67,

        /** Subtract value */
        Subtract = 68,

        /** Decimal value */
        Decimal = 69,

        /** Divide value */
        Divide = 70,

        /** Equals value */
        Equals = 71,

        /** NumpadEnter value */
        NumpadEnter = 72,

        /** RShift value */
        RShift = 73,

        /** RControl value */
        RControl = 74,

        /** RAlt value */
        RAlt = 75,

        /** VolumeMute value */
        VolumeMute = 76,

        /** VolumeUp value */
        VolumeUp = 77,

        /** VolumeDown value */
        VolumeDown = 78,

        /** Power value */
        Power = 79,

        /** CtrlAltDel value */
        CtrlAltDel = 100,

        /** LockScreen value */
        LockScreen = 101
    }

    /**
     * Properties of a KeyEvent.
     * @deprecated Use hbb.KeyEvent.$Properties instead.
     */
    interface IKeyEvent extends hbb.KeyEvent.$Properties {
    }

    /** Represents a KeyEvent. */
    class KeyEvent {

        /**
         * Constructs a new KeyEvent.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.KeyEvent.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** KeyEvent down. */
        down: boolean;

        /** KeyEvent press. */
        press: boolean;

        /** KeyEvent controlKey. */
        controlKey?: (hbb.ControlKey|null);

        /** KeyEvent chr. */
        chr?: (number|null);

        /** KeyEvent unicode. */
        unicode?: (number|null);

        /** KeyEvent seq. */
        seq?: (string|null);

        /** KeyEvent win2winHotkey. */
        win2winHotkey?: (number|null);

        /** KeyEvent modifiers. */
        modifiers: hbb.ControlKey[];

        /** KeyEvent mode. */
        mode: hbb.KeyboardMode;

        /** KeyEvent union. */
        union?: ("controlKey"|"chr"|"unicode"|"seq"|"win2winHotkey");

        /**
         * Creates a new KeyEvent instance using the specified properties.
         * @param [properties] Properties to set
         * @returns KeyEvent instance
         */
        static create(properties: hbb.KeyEvent.$Shape): hbb.KeyEvent & hbb.KeyEvent.$Shape;
        static create(properties?: hbb.KeyEvent.$Properties): hbb.KeyEvent;

        /**
         * Encodes the specified KeyEvent message. Does not implicitly {@link hbb.KeyEvent.verify|verify} messages.
         * @param message KeyEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.KeyEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified KeyEvent message, length delimited. Does not implicitly {@link hbb.KeyEvent.verify|verify} messages.
         * @param message KeyEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.KeyEvent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a KeyEvent message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.KeyEvent & hbb.KeyEvent.$Shape} KeyEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.KeyEvent & hbb.KeyEvent.$Shape;

        /**
         * Decodes a KeyEvent message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.KeyEvent & hbb.KeyEvent.$Shape} KeyEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.KeyEvent & hbb.KeyEvent.$Shape;

        /**
         * Verifies a KeyEvent message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a KeyEvent message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns KeyEvent
         */
        static fromObject(object: { [k: string]: any }): hbb.KeyEvent;

        /**
         * Creates a plain object from a KeyEvent message. Also converts values to other types if specified.
         * @param message KeyEvent
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.KeyEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this KeyEvent to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for KeyEvent
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace KeyEvent {

        /** Properties of a KeyEvent. */
        interface $Properties {

            /** KeyEvent down */
            down?: (boolean|null);

            /** KeyEvent press */
            press?: (boolean|null);

            /** KeyEvent controlKey */
            controlKey?: (hbb.ControlKey|null);

            /** KeyEvent chr */
            chr?: (number|null);

            /** KeyEvent unicode */
            unicode?: (number|null);

            /** KeyEvent seq */
            seq?: (string|null);

            /** KeyEvent win2winHotkey */
            win2winHotkey?: (number|null);

            /** KeyEvent modifiers */
            modifiers?: (hbb.ControlKey[]|null);

            /** KeyEvent mode */
            mode?: (hbb.KeyboardMode|null);

            /** KeyEvent union */
            union?: ("controlKey"|"chr"|"unicode"|"seq"|"win2winHotkey");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a KeyEvent. */
        type $Shape = {
          down?: boolean|null;
          press?: boolean|null;
          controlKey?: hbb.ControlKey|null;
          chr?: number|null;
          unicode?: number|null;
          seq?: string|null;
          win2winHotkey?: number|null;
          modifiers?: hbb.ControlKey[]|null;
          mode?: hbb.KeyboardMode|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; controlKey?: null; chr?: null; unicode?: null; seq?: null; win2winHotkey?: null }|{ union?: "controlKey"; controlKey: hbb.ControlKey; chr?: null; unicode?: null; seq?: null; win2winHotkey?: null }|{ union?: "chr"; controlKey?: null; chr: number; unicode?: null; seq?: null; win2winHotkey?: null }|{ union?: "unicode"; controlKey?: null; chr?: null; unicode: number; seq?: null; win2winHotkey?: null }|{ union?: "seq"; controlKey?: null; chr?: null; unicode?: null; seq: string; win2winHotkey?: null }|{ union?: "win2winHotkey"; controlKey?: null; chr?: null; unicode?: null; seq?: null; win2winHotkey: number })
        );
    }

    /**
     * Properties of a CursorData.
     * @deprecated Use hbb.CursorData.$Properties instead.
     */
    interface ICursorData extends hbb.CursorData.$Properties {
    }

    /** Represents a CursorData. */
    class CursorData {

        /**
         * Constructs a new CursorData.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CursorData.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CursorData id. */
        id: (number|Long);

        /** CursorData hotx. */
        hotx: number;

        /** CursorData hoty. */
        hoty: number;

        /** CursorData width. */
        width: number;

        /** CursorData height. */
        height: number;

        /** CursorData colors. */
        colors: Uint8Array;

        /**
         * Creates a new CursorData instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CursorData instance
         */
        static create(properties: hbb.CursorData.$Shape): hbb.CursorData & hbb.CursorData.$Shape;
        static create(properties?: hbb.CursorData.$Properties): hbb.CursorData;

        /**
         * Encodes the specified CursorData message. Does not implicitly {@link hbb.CursorData.verify|verify} messages.
         * @param message CursorData message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CursorData.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CursorData message, length delimited. Does not implicitly {@link hbb.CursorData.verify|verify} messages.
         * @param message CursorData message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CursorData.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CursorData message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CursorData & hbb.CursorData.$Shape} CursorData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CursorData & hbb.CursorData.$Shape;

        /**
         * Decodes a CursorData message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CursorData & hbb.CursorData.$Shape} CursorData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CursorData & hbb.CursorData.$Shape;

        /**
         * Verifies a CursorData message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CursorData message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CursorData
         */
        static fromObject(object: { [k: string]: any }): hbb.CursorData;

        /**
         * Creates a plain object from a CursorData message. Also converts values to other types if specified.
         * @param message CursorData
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CursorData, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CursorData to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CursorData
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CursorData {

        /** Properties of a CursorData. */
        interface $Properties {

            /** CursorData id */
            id?: (number|Long|null);

            /** CursorData hotx */
            hotx?: (number|null);

            /** CursorData hoty */
            hoty?: (number|null);

            /** CursorData width */
            width?: (number|null);

            /** CursorData height */
            height?: (number|null);

            /** CursorData colors */
            colors?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CursorData. */
        type $Shape = hbb.CursorData.$Properties;
    }

    /**
     * Properties of a CursorPosition.
     * @deprecated Use hbb.CursorPosition.$Properties instead.
     */
    interface ICursorPosition extends hbb.CursorPosition.$Properties {
    }

    /** Represents a CursorPosition. */
    class CursorPosition {

        /**
         * Constructs a new CursorPosition.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CursorPosition.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CursorPosition x. */
        x: number;

        /** CursorPosition y. */
        y: number;

        /**
         * Creates a new CursorPosition instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CursorPosition instance
         */
        static create(properties: hbb.CursorPosition.$Shape): hbb.CursorPosition & hbb.CursorPosition.$Shape;
        static create(properties?: hbb.CursorPosition.$Properties): hbb.CursorPosition;

        /**
         * Encodes the specified CursorPosition message. Does not implicitly {@link hbb.CursorPosition.verify|verify} messages.
         * @param message CursorPosition message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CursorPosition.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CursorPosition message, length delimited. Does not implicitly {@link hbb.CursorPosition.verify|verify} messages.
         * @param message CursorPosition message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CursorPosition.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CursorPosition message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CursorPosition & hbb.CursorPosition.$Shape} CursorPosition
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CursorPosition & hbb.CursorPosition.$Shape;

        /**
         * Decodes a CursorPosition message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CursorPosition & hbb.CursorPosition.$Shape} CursorPosition
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CursorPosition & hbb.CursorPosition.$Shape;

        /**
         * Verifies a CursorPosition message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CursorPosition message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CursorPosition
         */
        static fromObject(object: { [k: string]: any }): hbb.CursorPosition;

        /**
         * Creates a plain object from a CursorPosition message. Also converts values to other types if specified.
         * @param message CursorPosition
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CursorPosition, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CursorPosition to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CursorPosition
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CursorPosition {

        /** Properties of a CursorPosition. */
        interface $Properties {

            /** CursorPosition x */
            x?: (number|null);

            /** CursorPosition y */
            y?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CursorPosition. */
        type $Shape = hbb.CursorPosition.$Properties;
    }

    /**
     * Properties of a Hash.
     * @deprecated Use hbb.Hash.$Properties instead.
     */
    interface IHash extends hbb.Hash.$Properties {
    }

    /** Represents a Hash. */
    class Hash {

        /**
         * Constructs a new Hash.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Hash.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Hash salt. */
        salt: string;

        /** Hash challenge. */
        challenge: string;

        /**
         * Creates a new Hash instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Hash instance
         */
        static create(properties: hbb.Hash.$Shape): hbb.Hash & hbb.Hash.$Shape;
        static create(properties?: hbb.Hash.$Properties): hbb.Hash;

        /**
         * Encodes the specified Hash message. Does not implicitly {@link hbb.Hash.verify|verify} messages.
         * @param message Hash message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Hash.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Hash message, length delimited. Does not implicitly {@link hbb.Hash.verify|verify} messages.
         * @param message Hash message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Hash.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Hash message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Hash & hbb.Hash.$Shape} Hash
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Hash & hbb.Hash.$Shape;

        /**
         * Decodes a Hash message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Hash & hbb.Hash.$Shape} Hash
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Hash & hbb.Hash.$Shape;

        /**
         * Verifies a Hash message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Hash message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Hash
         */
        static fromObject(object: { [k: string]: any }): hbb.Hash;

        /**
         * Creates a plain object from a Hash message. Also converts values to other types if specified.
         * @param message Hash
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Hash, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Hash to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Hash
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Hash {

        /** Properties of a Hash. */
        interface $Properties {

            /** Hash salt */
            salt?: (string|null);

            /** Hash challenge */
            challenge?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a Hash. */
        type $Shape = hbb.Hash.$Properties;
    }

    /** ClipboardFormat enum. */
    enum ClipboardFormat {

        /** Text value */
        Text = 0,

        /** Rtf value */
        Rtf = 1,

        /** Html value */
        Html = 2,

        /** ImageRgba value */
        ImageRgba = 21,

        /** ImagePng value */
        ImagePng = 22,

        /** ImageSvg value */
        ImageSvg = 23,

        /** Special value */
        Special = 31
    }

    /**
     * Properties of a Clipboard.
     * @deprecated Use hbb.Clipboard.$Properties instead.
     */
    interface IClipboard extends hbb.Clipboard.$Properties {
    }

    /** Represents a Clipboard. */
    class Clipboard {

        /**
         * Constructs a new Clipboard.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Clipboard.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Clipboard compress. */
        compress: boolean;

        /** Clipboard content. */
        content: Uint8Array;

        /** Clipboard width. */
        width: number;

        /** Clipboard height. */
        height: number;

        /** Clipboard format. */
        format: hbb.ClipboardFormat;

        /** Clipboard specialName. */
        specialName: string;

        /**
         * Creates a new Clipboard instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Clipboard instance
         */
        static create(properties: hbb.Clipboard.$Shape): hbb.Clipboard & hbb.Clipboard.$Shape;
        static create(properties?: hbb.Clipboard.$Properties): hbb.Clipboard;

        /**
         * Encodes the specified Clipboard message. Does not implicitly {@link hbb.Clipboard.verify|verify} messages.
         * @param message Clipboard message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Clipboard.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Clipboard message, length delimited. Does not implicitly {@link hbb.Clipboard.verify|verify} messages.
         * @param message Clipboard message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Clipboard.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Clipboard message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Clipboard & hbb.Clipboard.$Shape} Clipboard
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Clipboard & hbb.Clipboard.$Shape;

        /**
         * Decodes a Clipboard message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Clipboard & hbb.Clipboard.$Shape} Clipboard
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Clipboard & hbb.Clipboard.$Shape;

        /**
         * Verifies a Clipboard message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Clipboard message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Clipboard
         */
        static fromObject(object: { [k: string]: any }): hbb.Clipboard;

        /**
         * Creates a plain object from a Clipboard message. Also converts values to other types if specified.
         * @param message Clipboard
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Clipboard, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Clipboard to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Clipboard
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Clipboard {

        /** Properties of a Clipboard. */
        interface $Properties {

            /** Clipboard compress */
            compress?: (boolean|null);

            /** Clipboard content */
            content?: (Uint8Array|null);

            /** Clipboard width */
            width?: (number|null);

            /** Clipboard height */
            height?: (number|null);

            /** Clipboard format */
            format?: (hbb.ClipboardFormat|null);

            /** Clipboard specialName */
            specialName?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a Clipboard. */
        type $Shape = hbb.Clipboard.$Properties;
    }

    /**
     * Properties of a MultiClipboards.
     * @deprecated Use hbb.MultiClipboards.$Properties instead.
     */
    interface IMultiClipboards extends hbb.MultiClipboards.$Properties {
    }

    /** Represents a MultiClipboards. */
    class MultiClipboards {

        /**
         * Constructs a new MultiClipboards.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.MultiClipboards.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** MultiClipboards clipboards. */
        clipboards: hbb.Clipboard.$Properties[];

        /**
         * Creates a new MultiClipboards instance using the specified properties.
         * @param [properties] Properties to set
         * @returns MultiClipboards instance
         */
        static create(properties: hbb.MultiClipboards.$Shape): hbb.MultiClipboards & hbb.MultiClipboards.$Shape;
        static create(properties?: hbb.MultiClipboards.$Properties): hbb.MultiClipboards;

        /**
         * Encodes the specified MultiClipboards message. Does not implicitly {@link hbb.MultiClipboards.verify|verify} messages.
         * @param message MultiClipboards message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.MultiClipboards.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified MultiClipboards message, length delimited. Does not implicitly {@link hbb.MultiClipboards.verify|verify} messages.
         * @param message MultiClipboards message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.MultiClipboards.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MultiClipboards message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.MultiClipboards & hbb.MultiClipboards.$Shape} MultiClipboards
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.MultiClipboards & hbb.MultiClipboards.$Shape;

        /**
         * Decodes a MultiClipboards message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.MultiClipboards & hbb.MultiClipboards.$Shape} MultiClipboards
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.MultiClipboards & hbb.MultiClipboards.$Shape;

        /**
         * Verifies a MultiClipboards message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a MultiClipboards message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns MultiClipboards
         */
        static fromObject(object: { [k: string]: any }): hbb.MultiClipboards;

        /**
         * Creates a plain object from a MultiClipboards message. Also converts values to other types if specified.
         * @param message MultiClipboards
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.MultiClipboards, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this MultiClipboards to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for MultiClipboards
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace MultiClipboards {

        /** Properties of a MultiClipboards. */
        interface $Properties {

            /** MultiClipboards clipboards */
            clipboards?: (hbb.Clipboard.$Properties[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a MultiClipboards. */
        type $Shape = hbb.MultiClipboards.$Properties;
    }

    /** FileType enum. */
    enum FileType {

        /** Dir value */
        Dir = 0,

        /** DirLink value */
        DirLink = 2,

        /** DirDrive value */
        DirDrive = 3,

        /** File value */
        File = 4,

        /** FileLink value */
        FileLink = 5
    }

    /**
     * Properties of a FileEntry.
     * @deprecated Use hbb.FileEntry.$Properties instead.
     */
    interface IFileEntry extends hbb.FileEntry.$Properties {
    }

    /** Represents a FileEntry. */
    class FileEntry {

        /**
         * Constructs a new FileEntry.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileEntry.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileEntry entryType. */
        entryType: hbb.FileType;

        /** FileEntry name. */
        name: string;

        /** FileEntry isHidden. */
        isHidden: boolean;

        /** FileEntry size. */
        size: (number|Long);

        /** FileEntry modifiedTime. */
        modifiedTime: (number|Long);

        /**
         * Creates a new FileEntry instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileEntry instance
         */
        static create(properties: hbb.FileEntry.$Shape): hbb.FileEntry & hbb.FileEntry.$Shape;
        static create(properties?: hbb.FileEntry.$Properties): hbb.FileEntry;

        /**
         * Encodes the specified FileEntry message. Does not implicitly {@link hbb.FileEntry.verify|verify} messages.
         * @param message FileEntry message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileEntry.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileEntry message, length delimited. Does not implicitly {@link hbb.FileEntry.verify|verify} messages.
         * @param message FileEntry message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileEntry.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileEntry message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileEntry & hbb.FileEntry.$Shape} FileEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileEntry & hbb.FileEntry.$Shape;

        /**
         * Decodes a FileEntry message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileEntry & hbb.FileEntry.$Shape} FileEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileEntry & hbb.FileEntry.$Shape;

        /**
         * Verifies a FileEntry message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileEntry message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileEntry
         */
        static fromObject(object: { [k: string]: any }): hbb.FileEntry;

        /**
         * Creates a plain object from a FileEntry message. Also converts values to other types if specified.
         * @param message FileEntry
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileEntry, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileEntry to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileEntry
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileEntry {

        /** Properties of a FileEntry. */
        interface $Properties {

            /** FileEntry entryType */
            entryType?: (hbb.FileType|null);

            /** FileEntry name */
            name?: (string|null);

            /** FileEntry isHidden */
            isHidden?: (boolean|null);

            /** FileEntry size */
            size?: (number|Long|null);

            /** FileEntry modifiedTime */
            modifiedTime?: (number|Long|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileEntry. */
        type $Shape = hbb.FileEntry.$Properties;
    }

    /**
     * Properties of a FileDirectory.
     * @deprecated Use hbb.FileDirectory.$Properties instead.
     */
    interface IFileDirectory extends hbb.FileDirectory.$Properties {
    }

    /** Represents a FileDirectory. */
    class FileDirectory {

        /**
         * Constructs a new FileDirectory.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileDirectory.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileDirectory id. */
        id: number;

        /** FileDirectory path. */
        path: string;

        /** FileDirectory entries. */
        entries: hbb.FileEntry.$Properties[];

        /**
         * Creates a new FileDirectory instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileDirectory instance
         */
        static create(properties: hbb.FileDirectory.$Shape): hbb.FileDirectory & hbb.FileDirectory.$Shape;
        static create(properties?: hbb.FileDirectory.$Properties): hbb.FileDirectory;

        /**
         * Encodes the specified FileDirectory message. Does not implicitly {@link hbb.FileDirectory.verify|verify} messages.
         * @param message FileDirectory message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileDirectory.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileDirectory message, length delimited. Does not implicitly {@link hbb.FileDirectory.verify|verify} messages.
         * @param message FileDirectory message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileDirectory.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileDirectory message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileDirectory & hbb.FileDirectory.$Shape} FileDirectory
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileDirectory & hbb.FileDirectory.$Shape;

        /**
         * Decodes a FileDirectory message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileDirectory & hbb.FileDirectory.$Shape} FileDirectory
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileDirectory & hbb.FileDirectory.$Shape;

        /**
         * Verifies a FileDirectory message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileDirectory message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileDirectory
         */
        static fromObject(object: { [k: string]: any }): hbb.FileDirectory;

        /**
         * Creates a plain object from a FileDirectory message. Also converts values to other types if specified.
         * @param message FileDirectory
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileDirectory, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileDirectory to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileDirectory
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileDirectory {

        /** Properties of a FileDirectory. */
        interface $Properties {

            /** FileDirectory id */
            id?: (number|null);

            /** FileDirectory path */
            path?: (string|null);

            /** FileDirectory entries */
            entries?: (hbb.FileEntry.$Properties[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileDirectory. */
        type $Shape = hbb.FileDirectory.$Properties;
    }

    /**
     * Properties of a ReadDir.
     * @deprecated Use hbb.ReadDir.$Properties instead.
     */
    interface IReadDir extends hbb.ReadDir.$Properties {
    }

    /** Represents a ReadDir. */
    class ReadDir {

        /**
         * Constructs a new ReadDir.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ReadDir.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ReadDir path. */
        path: string;

        /** ReadDir includeHidden. */
        includeHidden: boolean;

        /**
         * Creates a new ReadDir instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ReadDir instance
         */
        static create(properties: hbb.ReadDir.$Shape): hbb.ReadDir & hbb.ReadDir.$Shape;
        static create(properties?: hbb.ReadDir.$Properties): hbb.ReadDir;

        /**
         * Encodes the specified ReadDir message. Does not implicitly {@link hbb.ReadDir.verify|verify} messages.
         * @param message ReadDir message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ReadDir.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ReadDir message, length delimited. Does not implicitly {@link hbb.ReadDir.verify|verify} messages.
         * @param message ReadDir message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ReadDir.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ReadDir message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ReadDir & hbb.ReadDir.$Shape} ReadDir
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ReadDir & hbb.ReadDir.$Shape;

        /**
         * Decodes a ReadDir message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ReadDir & hbb.ReadDir.$Shape} ReadDir
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ReadDir & hbb.ReadDir.$Shape;

        /**
         * Verifies a ReadDir message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ReadDir message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ReadDir
         */
        static fromObject(object: { [k: string]: any }): hbb.ReadDir;

        /**
         * Creates a plain object from a ReadDir message. Also converts values to other types if specified.
         * @param message ReadDir
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ReadDir, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ReadDir to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ReadDir
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ReadDir {

        /** Properties of a ReadDir. */
        interface $Properties {

            /** ReadDir path */
            path?: (string|null);

            /** ReadDir includeHidden */
            includeHidden?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ReadDir. */
        type $Shape = hbb.ReadDir.$Properties;
    }

    /**
     * Properties of a ReadEmptyDirs.
     * @deprecated Use hbb.ReadEmptyDirs.$Properties instead.
     */
    interface IReadEmptyDirs extends hbb.ReadEmptyDirs.$Properties {
    }

    /** Represents a ReadEmptyDirs. */
    class ReadEmptyDirs {

        /**
         * Constructs a new ReadEmptyDirs.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ReadEmptyDirs.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ReadEmptyDirs path. */
        path: string;

        /** ReadEmptyDirs includeHidden. */
        includeHidden: boolean;

        /**
         * Creates a new ReadEmptyDirs instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ReadEmptyDirs instance
         */
        static create(properties: hbb.ReadEmptyDirs.$Shape): hbb.ReadEmptyDirs & hbb.ReadEmptyDirs.$Shape;
        static create(properties?: hbb.ReadEmptyDirs.$Properties): hbb.ReadEmptyDirs;

        /**
         * Encodes the specified ReadEmptyDirs message. Does not implicitly {@link hbb.ReadEmptyDirs.verify|verify} messages.
         * @param message ReadEmptyDirs message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ReadEmptyDirs.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ReadEmptyDirs message, length delimited. Does not implicitly {@link hbb.ReadEmptyDirs.verify|verify} messages.
         * @param message ReadEmptyDirs message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ReadEmptyDirs.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ReadEmptyDirs message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ReadEmptyDirs & hbb.ReadEmptyDirs.$Shape} ReadEmptyDirs
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ReadEmptyDirs & hbb.ReadEmptyDirs.$Shape;

        /**
         * Decodes a ReadEmptyDirs message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ReadEmptyDirs & hbb.ReadEmptyDirs.$Shape} ReadEmptyDirs
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ReadEmptyDirs & hbb.ReadEmptyDirs.$Shape;

        /**
         * Verifies a ReadEmptyDirs message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ReadEmptyDirs message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ReadEmptyDirs
         */
        static fromObject(object: { [k: string]: any }): hbb.ReadEmptyDirs;

        /**
         * Creates a plain object from a ReadEmptyDirs message. Also converts values to other types if specified.
         * @param message ReadEmptyDirs
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ReadEmptyDirs, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ReadEmptyDirs to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ReadEmptyDirs
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ReadEmptyDirs {

        /** Properties of a ReadEmptyDirs. */
        interface $Properties {

            /** ReadEmptyDirs path */
            path?: (string|null);

            /** ReadEmptyDirs includeHidden */
            includeHidden?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ReadEmptyDirs. */
        type $Shape = hbb.ReadEmptyDirs.$Properties;
    }

    /**
     * Properties of a ReadEmptyDirsResponse.
     * @deprecated Use hbb.ReadEmptyDirsResponse.$Properties instead.
     */
    interface IReadEmptyDirsResponse extends hbb.ReadEmptyDirsResponse.$Properties {
    }

    /** Represents a ReadEmptyDirsResponse. */
    class ReadEmptyDirsResponse {

        /**
         * Constructs a new ReadEmptyDirsResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ReadEmptyDirsResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ReadEmptyDirsResponse path. */
        path: string;

        /** ReadEmptyDirsResponse emptyDirs. */
        emptyDirs: hbb.FileDirectory.$Properties[];

        /**
         * Creates a new ReadEmptyDirsResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ReadEmptyDirsResponse instance
         */
        static create(properties: hbb.ReadEmptyDirsResponse.$Shape): hbb.ReadEmptyDirsResponse & hbb.ReadEmptyDirsResponse.$Shape;
        static create(properties?: hbb.ReadEmptyDirsResponse.$Properties): hbb.ReadEmptyDirsResponse;

        /**
         * Encodes the specified ReadEmptyDirsResponse message. Does not implicitly {@link hbb.ReadEmptyDirsResponse.verify|verify} messages.
         * @param message ReadEmptyDirsResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ReadEmptyDirsResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ReadEmptyDirsResponse message, length delimited. Does not implicitly {@link hbb.ReadEmptyDirsResponse.verify|verify} messages.
         * @param message ReadEmptyDirsResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ReadEmptyDirsResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ReadEmptyDirsResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ReadEmptyDirsResponse & hbb.ReadEmptyDirsResponse.$Shape} ReadEmptyDirsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ReadEmptyDirsResponse & hbb.ReadEmptyDirsResponse.$Shape;

        /**
         * Decodes a ReadEmptyDirsResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ReadEmptyDirsResponse & hbb.ReadEmptyDirsResponse.$Shape} ReadEmptyDirsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ReadEmptyDirsResponse & hbb.ReadEmptyDirsResponse.$Shape;

        /**
         * Verifies a ReadEmptyDirsResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ReadEmptyDirsResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ReadEmptyDirsResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.ReadEmptyDirsResponse;

        /**
         * Creates a plain object from a ReadEmptyDirsResponse message. Also converts values to other types if specified.
         * @param message ReadEmptyDirsResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ReadEmptyDirsResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ReadEmptyDirsResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ReadEmptyDirsResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ReadEmptyDirsResponse {

        /** Properties of a ReadEmptyDirsResponse. */
        interface $Properties {

            /** ReadEmptyDirsResponse path */
            path?: (string|null);

            /** ReadEmptyDirsResponse emptyDirs */
            emptyDirs?: (hbb.FileDirectory.$Properties[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ReadEmptyDirsResponse. */
        type $Shape = hbb.ReadEmptyDirsResponse.$Properties;
    }

    /**
     * Properties of a ReadAllFiles.
     * @deprecated Use hbb.ReadAllFiles.$Properties instead.
     */
    interface IReadAllFiles extends hbb.ReadAllFiles.$Properties {
    }

    /** Represents a ReadAllFiles. */
    class ReadAllFiles {

        /**
         * Constructs a new ReadAllFiles.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ReadAllFiles.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ReadAllFiles id. */
        id: number;

        /** ReadAllFiles path. */
        path: string;

        /** ReadAllFiles includeHidden. */
        includeHidden: boolean;

        /**
         * Creates a new ReadAllFiles instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ReadAllFiles instance
         */
        static create(properties: hbb.ReadAllFiles.$Shape): hbb.ReadAllFiles & hbb.ReadAllFiles.$Shape;
        static create(properties?: hbb.ReadAllFiles.$Properties): hbb.ReadAllFiles;

        /**
         * Encodes the specified ReadAllFiles message. Does not implicitly {@link hbb.ReadAllFiles.verify|verify} messages.
         * @param message ReadAllFiles message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ReadAllFiles.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ReadAllFiles message, length delimited. Does not implicitly {@link hbb.ReadAllFiles.verify|verify} messages.
         * @param message ReadAllFiles message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ReadAllFiles.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ReadAllFiles message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ReadAllFiles & hbb.ReadAllFiles.$Shape} ReadAllFiles
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ReadAllFiles & hbb.ReadAllFiles.$Shape;

        /**
         * Decodes a ReadAllFiles message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ReadAllFiles & hbb.ReadAllFiles.$Shape} ReadAllFiles
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ReadAllFiles & hbb.ReadAllFiles.$Shape;

        /**
         * Verifies a ReadAllFiles message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ReadAllFiles message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ReadAllFiles
         */
        static fromObject(object: { [k: string]: any }): hbb.ReadAllFiles;

        /**
         * Creates a plain object from a ReadAllFiles message. Also converts values to other types if specified.
         * @param message ReadAllFiles
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ReadAllFiles, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ReadAllFiles to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ReadAllFiles
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ReadAllFiles {

        /** Properties of a ReadAllFiles. */
        interface $Properties {

            /** ReadAllFiles id */
            id?: (number|null);

            /** ReadAllFiles path */
            path?: (string|null);

            /** ReadAllFiles includeHidden */
            includeHidden?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ReadAllFiles. */
        type $Shape = hbb.ReadAllFiles.$Properties;
    }

    /**
     * Properties of a FileRename.
     * @deprecated Use hbb.FileRename.$Properties instead.
     */
    interface IFileRename extends hbb.FileRename.$Properties {
    }

    /** Represents a FileRename. */
    class FileRename {

        /**
         * Constructs a new FileRename.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileRename.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileRename id. */
        id: number;

        /** FileRename path. */
        path: string;

        /** FileRename newName. */
        newName: string;

        /**
         * Creates a new FileRename instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileRename instance
         */
        static create(properties: hbb.FileRename.$Shape): hbb.FileRename & hbb.FileRename.$Shape;
        static create(properties?: hbb.FileRename.$Properties): hbb.FileRename;

        /**
         * Encodes the specified FileRename message. Does not implicitly {@link hbb.FileRename.verify|verify} messages.
         * @param message FileRename message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileRename.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileRename message, length delimited. Does not implicitly {@link hbb.FileRename.verify|verify} messages.
         * @param message FileRename message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileRename.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileRename message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileRename & hbb.FileRename.$Shape} FileRename
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileRename & hbb.FileRename.$Shape;

        /**
         * Decodes a FileRename message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileRename & hbb.FileRename.$Shape} FileRename
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileRename & hbb.FileRename.$Shape;

        /**
         * Verifies a FileRename message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileRename message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileRename
         */
        static fromObject(object: { [k: string]: any }): hbb.FileRename;

        /**
         * Creates a plain object from a FileRename message. Also converts values to other types if specified.
         * @param message FileRename
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileRename, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileRename to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileRename
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileRename {

        /** Properties of a FileRename. */
        interface $Properties {

            /** FileRename id */
            id?: (number|null);

            /** FileRename path */
            path?: (string|null);

            /** FileRename newName */
            newName?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileRename. */
        type $Shape = hbb.FileRename.$Properties;
    }

    /**
     * Properties of a FileAction.
     * @deprecated Use hbb.FileAction.$Properties instead.
     */
    interface IFileAction extends hbb.FileAction.$Properties {
    }

    /** Represents a FileAction. */
    class FileAction {

        /**
         * Constructs a new FileAction.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileAction.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileAction readDir. */
        readDir?: (hbb.ReadDir.$Properties|null);

        /** FileAction send. */
        send?: (hbb.FileTransferSendRequest.$Properties|null);

        /** FileAction receive. */
        receive?: (hbb.FileTransferReceiveRequest.$Properties|null);

        /** FileAction create. */
        create?: (hbb.FileDirCreate.$Properties|null);

        /** FileAction removeDir. */
        removeDir?: (hbb.FileRemoveDir.$Properties|null);

        /** FileAction removeFile. */
        removeFile?: (hbb.FileRemoveFile.$Properties|null);

        /** FileAction allFiles. */
        allFiles?: (hbb.ReadAllFiles.$Properties|null);

        /** FileAction cancel. */
        cancel?: (hbb.FileTransferCancel.$Properties|null);

        /** FileAction sendConfirm. */
        sendConfirm?: (hbb.FileTransferSendConfirmRequest.$Properties|null);

        /** FileAction rename. */
        rename?: (hbb.FileRename.$Properties|null);

        /** FileAction readEmptyDirs. */
        readEmptyDirs?: (hbb.ReadEmptyDirs.$Properties|null);

        /** FileAction union. */
        union?: ("readDir"|"send"|"receive"|"create"|"removeDir"|"removeFile"|"allFiles"|"cancel"|"sendConfirm"|"rename"|"readEmptyDirs");

        /**
         * Creates a new FileAction instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileAction instance
         */
        static create(properties: hbb.FileAction.$Shape): hbb.FileAction & hbb.FileAction.$Shape;
        static create(properties?: hbb.FileAction.$Properties): hbb.FileAction;

        /**
         * Encodes the specified FileAction message. Does not implicitly {@link hbb.FileAction.verify|verify} messages.
         * @param message FileAction message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileAction.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileAction message, length delimited. Does not implicitly {@link hbb.FileAction.verify|verify} messages.
         * @param message FileAction message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileAction.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileAction message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileAction & hbb.FileAction.$Shape} FileAction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileAction & hbb.FileAction.$Shape;

        /**
         * Decodes a FileAction message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileAction & hbb.FileAction.$Shape} FileAction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileAction & hbb.FileAction.$Shape;

        /**
         * Verifies a FileAction message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileAction message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileAction
         */
        static fromObject(object: { [k: string]: any }): hbb.FileAction;

        /**
         * Creates a plain object from a FileAction message. Also converts values to other types if specified.
         * @param message FileAction
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileAction, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileAction to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileAction
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileAction {

        /** Properties of a FileAction. */
        interface $Properties {

            /** FileAction readDir */
            readDir?: (hbb.ReadDir.$Properties|null);

            /** FileAction send */
            send?: (hbb.FileTransferSendRequest.$Properties|null);

            /** FileAction receive */
            receive?: (hbb.FileTransferReceiveRequest.$Properties|null);

            /** FileAction create */
            create?: (hbb.FileDirCreate.$Properties|null);

            /** FileAction removeDir */
            removeDir?: (hbb.FileRemoveDir.$Properties|null);

            /** FileAction removeFile */
            removeFile?: (hbb.FileRemoveFile.$Properties|null);

            /** FileAction allFiles */
            allFiles?: (hbb.ReadAllFiles.$Properties|null);

            /** FileAction cancel */
            cancel?: (hbb.FileTransferCancel.$Properties|null);

            /** FileAction sendConfirm */
            sendConfirm?: (hbb.FileTransferSendConfirmRequest.$Properties|null);

            /** FileAction rename */
            rename?: (hbb.FileRename.$Properties|null);

            /** FileAction readEmptyDirs */
            readEmptyDirs?: (hbb.ReadEmptyDirs.$Properties|null);

            /** FileAction union */
            union?: ("readDir"|"send"|"receive"|"create"|"removeDir"|"removeFile"|"allFiles"|"cancel"|"sendConfirm"|"rename"|"readEmptyDirs");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a FileAction. */
        type $Shape = {
          readDir?: hbb.ReadDir.$Shape|null;
          send?: hbb.FileTransferSendRequest.$Shape|null;
          receive?: hbb.FileTransferReceiveRequest.$Shape|null;
          create?: hbb.FileDirCreate.$Shape|null;
          removeDir?: hbb.FileRemoveDir.$Shape|null;
          removeFile?: hbb.FileRemoveFile.$Shape|null;
          allFiles?: hbb.ReadAllFiles.$Shape|null;
          cancel?: hbb.FileTransferCancel.$Shape|null;
          sendConfirm?: hbb.FileTransferSendConfirmRequest.$Shape|null;
          rename?: hbb.FileRename.$Shape|null;
          readEmptyDirs?: hbb.ReadEmptyDirs.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; readDir?: null; send?: null; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "readDir"; readDir: hbb.ReadDir.$Shape; send?: null; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "send"; readDir?: null; send: hbb.FileTransferSendRequest.$Shape; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "receive"; readDir?: null; send?: null; receive: hbb.FileTransferReceiveRequest.$Shape; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "create"; readDir?: null; send?: null; receive?: null; create: hbb.FileDirCreate.$Shape; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "removeDir"; readDir?: null; send?: null; receive?: null; create?: null; removeDir: hbb.FileRemoveDir.$Shape; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "removeFile"; readDir?: null; send?: null; receive?: null; create?: null; removeDir?: null; removeFile: hbb.FileRemoveFile.$Shape; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "allFiles"; readDir?: null; send?: null; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles: hbb.ReadAllFiles.$Shape; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "cancel"; readDir?: null; send?: null; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel: hbb.FileTransferCancel.$Shape; sendConfirm?: null; rename?: null; readEmptyDirs?: null }|{ union?: "sendConfirm"; readDir?: null; send?: null; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm: hbb.FileTransferSendConfirmRequest.$Shape; rename?: null; readEmptyDirs?: null }|{ union?: "rename"; readDir?: null; send?: null; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename: hbb.FileRename.$Shape; readEmptyDirs?: null }|{ union?: "readEmptyDirs"; readDir?: null; send?: null; receive?: null; create?: null; removeDir?: null; removeFile?: null; allFiles?: null; cancel?: null; sendConfirm?: null; rename?: null; readEmptyDirs: hbb.ReadEmptyDirs.$Shape })
        );
    }

    /**
     * Properties of a FileTransferCancel.
     * @deprecated Use hbb.FileTransferCancel.$Properties instead.
     */
    interface IFileTransferCancel extends hbb.FileTransferCancel.$Properties {
    }

    /** Represents a FileTransferCancel. */
    class FileTransferCancel {

        /**
         * Constructs a new FileTransferCancel.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferCancel.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferCancel id. */
        id: number;

        /**
         * Creates a new FileTransferCancel instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferCancel instance
         */
        static create(properties: hbb.FileTransferCancel.$Shape): hbb.FileTransferCancel & hbb.FileTransferCancel.$Shape;
        static create(properties?: hbb.FileTransferCancel.$Properties): hbb.FileTransferCancel;

        /**
         * Encodes the specified FileTransferCancel message. Does not implicitly {@link hbb.FileTransferCancel.verify|verify} messages.
         * @param message FileTransferCancel message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferCancel.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferCancel message, length delimited. Does not implicitly {@link hbb.FileTransferCancel.verify|verify} messages.
         * @param message FileTransferCancel message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferCancel.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferCancel message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferCancel & hbb.FileTransferCancel.$Shape} FileTransferCancel
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferCancel & hbb.FileTransferCancel.$Shape;

        /**
         * Decodes a FileTransferCancel message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferCancel & hbb.FileTransferCancel.$Shape} FileTransferCancel
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferCancel & hbb.FileTransferCancel.$Shape;

        /**
         * Verifies a FileTransferCancel message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferCancel message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferCancel
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferCancel;

        /**
         * Creates a plain object from a FileTransferCancel message. Also converts values to other types if specified.
         * @param message FileTransferCancel
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferCancel, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferCancel to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferCancel
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferCancel {

        /** Properties of a FileTransferCancel. */
        interface $Properties {

            /** FileTransferCancel id */
            id?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransferCancel. */
        type $Shape = hbb.FileTransferCancel.$Properties;
    }

    /**
     * Properties of a FileResponse.
     * @deprecated Use hbb.FileResponse.$Properties instead.
     */
    interface IFileResponse extends hbb.FileResponse.$Properties {
    }

    /** Represents a FileResponse. */
    class FileResponse {

        /**
         * Constructs a new FileResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileResponse dir. */
        dir?: (hbb.FileDirectory.$Properties|null);

        /** FileResponse block. */
        block?: (hbb.FileTransferBlock.$Properties|null);

        /** FileResponse error. */
        error?: (hbb.FileTransferError.$Properties|null);

        /** FileResponse done. */
        done?: (hbb.FileTransferDone.$Properties|null);

        /** FileResponse digest. */
        digest?: (hbb.FileTransferDigest.$Properties|null);

        /** FileResponse emptyDirs. */
        emptyDirs?: (hbb.ReadEmptyDirsResponse.$Properties|null);

        /** FileResponse union. */
        union?: ("dir"|"block"|"error"|"done"|"digest"|"emptyDirs");

        /**
         * Creates a new FileResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileResponse instance
         */
        static create(properties: hbb.FileResponse.$Shape): hbb.FileResponse & hbb.FileResponse.$Shape;
        static create(properties?: hbb.FileResponse.$Properties): hbb.FileResponse;

        /**
         * Encodes the specified FileResponse message. Does not implicitly {@link hbb.FileResponse.verify|verify} messages.
         * @param message FileResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileResponse message, length delimited. Does not implicitly {@link hbb.FileResponse.verify|verify} messages.
         * @param message FileResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileResponse & hbb.FileResponse.$Shape} FileResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileResponse & hbb.FileResponse.$Shape;

        /**
         * Decodes a FileResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileResponse & hbb.FileResponse.$Shape} FileResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileResponse & hbb.FileResponse.$Shape;

        /**
         * Verifies a FileResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.FileResponse;

        /**
         * Creates a plain object from a FileResponse message. Also converts values to other types if specified.
         * @param message FileResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileResponse {

        /** Properties of a FileResponse. */
        interface $Properties {

            /** FileResponse dir */
            dir?: (hbb.FileDirectory.$Properties|null);

            /** FileResponse block */
            block?: (hbb.FileTransferBlock.$Properties|null);

            /** FileResponse error */
            error?: (hbb.FileTransferError.$Properties|null);

            /** FileResponse done */
            done?: (hbb.FileTransferDone.$Properties|null);

            /** FileResponse digest */
            digest?: (hbb.FileTransferDigest.$Properties|null);

            /** FileResponse emptyDirs */
            emptyDirs?: (hbb.ReadEmptyDirsResponse.$Properties|null);

            /** FileResponse union */
            union?: ("dir"|"block"|"error"|"done"|"digest"|"emptyDirs");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a FileResponse. */
        type $Shape = {
          dir?: hbb.FileDirectory.$Shape|null;
          block?: hbb.FileTransferBlock.$Shape|null;
          error?: hbb.FileTransferError.$Shape|null;
          done?: hbb.FileTransferDone.$Shape|null;
          digest?: hbb.FileTransferDigest.$Shape|null;
          emptyDirs?: hbb.ReadEmptyDirsResponse.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; dir?: null; block?: null; error?: null; done?: null; digest?: null; emptyDirs?: null }|{ union?: "dir"; dir: hbb.FileDirectory.$Shape; block?: null; error?: null; done?: null; digest?: null; emptyDirs?: null }|{ union?: "block"; dir?: null; block: hbb.FileTransferBlock.$Shape; error?: null; done?: null; digest?: null; emptyDirs?: null }|{ union?: "error"; dir?: null; block?: null; error: hbb.FileTransferError.$Shape; done?: null; digest?: null; emptyDirs?: null }|{ union?: "done"; dir?: null; block?: null; error?: null; done: hbb.FileTransferDone.$Shape; digest?: null; emptyDirs?: null }|{ union?: "digest"; dir?: null; block?: null; error?: null; done?: null; digest: hbb.FileTransferDigest.$Shape; emptyDirs?: null }|{ union?: "emptyDirs"; dir?: null; block?: null; error?: null; done?: null; digest?: null; emptyDirs: hbb.ReadEmptyDirsResponse.$Shape })
        );
    }

    /**
     * Properties of a FileTransferDigest.
     * @deprecated Use hbb.FileTransferDigest.$Properties instead.
     */
    interface IFileTransferDigest extends hbb.FileTransferDigest.$Properties {
    }

    /** Represents a FileTransferDigest. */
    class FileTransferDigest {

        /**
         * Constructs a new FileTransferDigest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferDigest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferDigest id. */
        id: number;

        /** FileTransferDigest fileNum. */
        fileNum: number;

        /** FileTransferDigest lastModified. */
        lastModified: (number|Long);

        /** FileTransferDigest fileSize. */
        fileSize: (number|Long);

        /** FileTransferDigest isUpload. */
        isUpload: boolean;

        /** FileTransferDigest isIdentical. */
        isIdentical: boolean;

        /** FileTransferDigest transferredSize. */
        transferredSize: (number|Long);

        /** FileTransferDigest isResume. */
        isResume: boolean;

        /**
         * Creates a new FileTransferDigest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferDigest instance
         */
        static create(properties: hbb.FileTransferDigest.$Shape): hbb.FileTransferDigest & hbb.FileTransferDigest.$Shape;
        static create(properties?: hbb.FileTransferDigest.$Properties): hbb.FileTransferDigest;

        /**
         * Encodes the specified FileTransferDigest message. Does not implicitly {@link hbb.FileTransferDigest.verify|verify} messages.
         * @param message FileTransferDigest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferDigest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferDigest message, length delimited. Does not implicitly {@link hbb.FileTransferDigest.verify|verify} messages.
         * @param message FileTransferDigest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferDigest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferDigest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferDigest & hbb.FileTransferDigest.$Shape} FileTransferDigest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferDigest & hbb.FileTransferDigest.$Shape;

        /**
         * Decodes a FileTransferDigest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferDigest & hbb.FileTransferDigest.$Shape} FileTransferDigest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferDigest & hbb.FileTransferDigest.$Shape;

        /**
         * Verifies a FileTransferDigest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferDigest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferDigest
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferDigest;

        /**
         * Creates a plain object from a FileTransferDigest message. Also converts values to other types if specified.
         * @param message FileTransferDigest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferDigest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferDigest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferDigest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferDigest {

        /** Properties of a FileTransferDigest. */
        interface $Properties {

            /** FileTransferDigest id */
            id?: (number|null);

            /** FileTransferDigest fileNum */
            fileNum?: (number|null);

            /** FileTransferDigest lastModified */
            lastModified?: (number|Long|null);

            /** FileTransferDigest fileSize */
            fileSize?: (number|Long|null);

            /** FileTransferDigest isUpload */
            isUpload?: (boolean|null);

            /** FileTransferDigest isIdentical */
            isIdentical?: (boolean|null);

            /** FileTransferDigest transferredSize */
            transferredSize?: (number|Long|null);

            /** FileTransferDigest isResume */
            isResume?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransferDigest. */
        type $Shape = hbb.FileTransferDigest.$Properties;
    }

    /**
     * Properties of a FileTransferBlock.
     * @deprecated Use hbb.FileTransferBlock.$Properties instead.
     */
    interface IFileTransferBlock extends hbb.FileTransferBlock.$Properties {
    }

    /** Represents a FileTransferBlock. */
    class FileTransferBlock {

        /**
         * Constructs a new FileTransferBlock.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferBlock.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferBlock id. */
        id: number;

        /** FileTransferBlock fileNum. */
        fileNum: number;

        /** FileTransferBlock data. */
        data: Uint8Array;

        /** FileTransferBlock compressed. */
        compressed: boolean;

        /** FileTransferBlock blkId. */
        blkId: number;

        /**
         * Creates a new FileTransferBlock instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferBlock instance
         */
        static create(properties: hbb.FileTransferBlock.$Shape): hbb.FileTransferBlock & hbb.FileTransferBlock.$Shape;
        static create(properties?: hbb.FileTransferBlock.$Properties): hbb.FileTransferBlock;

        /**
         * Encodes the specified FileTransferBlock message. Does not implicitly {@link hbb.FileTransferBlock.verify|verify} messages.
         * @param message FileTransferBlock message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferBlock.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferBlock message, length delimited. Does not implicitly {@link hbb.FileTransferBlock.verify|verify} messages.
         * @param message FileTransferBlock message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferBlock.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferBlock message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferBlock & hbb.FileTransferBlock.$Shape} FileTransferBlock
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferBlock & hbb.FileTransferBlock.$Shape;

        /**
         * Decodes a FileTransferBlock message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferBlock & hbb.FileTransferBlock.$Shape} FileTransferBlock
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferBlock & hbb.FileTransferBlock.$Shape;

        /**
         * Verifies a FileTransferBlock message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferBlock message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferBlock
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferBlock;

        /**
         * Creates a plain object from a FileTransferBlock message. Also converts values to other types if specified.
         * @param message FileTransferBlock
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferBlock, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferBlock to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferBlock
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferBlock {

        /** Properties of a FileTransferBlock. */
        interface $Properties {

            /** FileTransferBlock id */
            id?: (number|null);

            /** FileTransferBlock fileNum */
            fileNum?: (number|null);

            /** FileTransferBlock data */
            data?: (Uint8Array|null);

            /** FileTransferBlock compressed */
            compressed?: (boolean|null);

            /** FileTransferBlock blkId */
            blkId?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransferBlock. */
        type $Shape = hbb.FileTransferBlock.$Properties;
    }

    /**
     * Properties of a FileTransferError.
     * @deprecated Use hbb.FileTransferError.$Properties instead.
     */
    interface IFileTransferError extends hbb.FileTransferError.$Properties {
    }

    /** Represents a FileTransferError. */
    class FileTransferError {

        /**
         * Constructs a new FileTransferError.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferError.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferError id. */
        id: number;

        /** FileTransferError error. */
        error: string;

        /** FileTransferError fileNum. */
        fileNum: number;

        /**
         * Creates a new FileTransferError instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferError instance
         */
        static create(properties: hbb.FileTransferError.$Shape): hbb.FileTransferError & hbb.FileTransferError.$Shape;
        static create(properties?: hbb.FileTransferError.$Properties): hbb.FileTransferError;

        /**
         * Encodes the specified FileTransferError message. Does not implicitly {@link hbb.FileTransferError.verify|verify} messages.
         * @param message FileTransferError message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferError.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferError message, length delimited. Does not implicitly {@link hbb.FileTransferError.verify|verify} messages.
         * @param message FileTransferError message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferError.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferError message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferError & hbb.FileTransferError.$Shape} FileTransferError
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferError & hbb.FileTransferError.$Shape;

        /**
         * Decodes a FileTransferError message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferError & hbb.FileTransferError.$Shape} FileTransferError
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferError & hbb.FileTransferError.$Shape;

        /**
         * Verifies a FileTransferError message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferError message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferError
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferError;

        /**
         * Creates a plain object from a FileTransferError message. Also converts values to other types if specified.
         * @param message FileTransferError
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferError, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferError to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferError
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferError {

        /** Properties of a FileTransferError. */
        interface $Properties {

            /** FileTransferError id */
            id?: (number|null);

            /** FileTransferError error */
            error?: (string|null);

            /** FileTransferError fileNum */
            fileNum?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransferError. */
        type $Shape = hbb.FileTransferError.$Properties;
    }

    /**
     * Properties of a FileTransferSendRequest.
     * @deprecated Use hbb.FileTransferSendRequest.$Properties instead.
     */
    interface IFileTransferSendRequest extends hbb.FileTransferSendRequest.$Properties {
    }

    /** Represents a FileTransferSendRequest. */
    class FileTransferSendRequest {

        /**
         * Constructs a new FileTransferSendRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferSendRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferSendRequest id. */
        id: number;

        /** FileTransferSendRequest path. */
        path: string;

        /** FileTransferSendRequest includeHidden. */
        includeHidden: boolean;

        /** FileTransferSendRequest fileNum. */
        fileNum: number;

        /** FileTransferSendRequest fileType. */
        fileType: hbb.FileTransferSendRequest.FileType;

        /**
         * Creates a new FileTransferSendRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferSendRequest instance
         */
        static create(properties: hbb.FileTransferSendRequest.$Shape): hbb.FileTransferSendRequest & hbb.FileTransferSendRequest.$Shape;
        static create(properties?: hbb.FileTransferSendRequest.$Properties): hbb.FileTransferSendRequest;

        /**
         * Encodes the specified FileTransferSendRequest message. Does not implicitly {@link hbb.FileTransferSendRequest.verify|verify} messages.
         * @param message FileTransferSendRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferSendRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferSendRequest message, length delimited. Does not implicitly {@link hbb.FileTransferSendRequest.verify|verify} messages.
         * @param message FileTransferSendRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferSendRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferSendRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferSendRequest & hbb.FileTransferSendRequest.$Shape} FileTransferSendRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferSendRequest & hbb.FileTransferSendRequest.$Shape;

        /**
         * Decodes a FileTransferSendRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferSendRequest & hbb.FileTransferSendRequest.$Shape} FileTransferSendRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferSendRequest & hbb.FileTransferSendRequest.$Shape;

        /**
         * Verifies a FileTransferSendRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferSendRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferSendRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferSendRequest;

        /**
         * Creates a plain object from a FileTransferSendRequest message. Also converts values to other types if specified.
         * @param message FileTransferSendRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferSendRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferSendRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferSendRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferSendRequest {

        /** Properties of a FileTransferSendRequest. */
        interface $Properties {

            /** FileTransferSendRequest id */
            id?: (number|null);

            /** FileTransferSendRequest path */
            path?: (string|null);

            /** FileTransferSendRequest includeHidden */
            includeHidden?: (boolean|null);

            /** FileTransferSendRequest fileNum */
            fileNum?: (number|null);

            /** FileTransferSendRequest fileType */
            fileType?: (hbb.FileTransferSendRequest.FileType|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransferSendRequest. */
        type $Shape = hbb.FileTransferSendRequest.$Properties;

        /** FileType enum. */
        enum FileType {

            /** Generic value */
            Generic = 0,

            /** Printer value */
            Printer = 1
        }
    }

    /**
     * Properties of a FileTransferSendConfirmRequest.
     * @deprecated Use hbb.FileTransferSendConfirmRequest.$Properties instead.
     */
    interface IFileTransferSendConfirmRequest extends hbb.FileTransferSendConfirmRequest.$Properties {
    }

    /** Represents a FileTransferSendConfirmRequest. */
    class FileTransferSendConfirmRequest {

        /**
         * Constructs a new FileTransferSendConfirmRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferSendConfirmRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferSendConfirmRequest id. */
        id: number;

        /** FileTransferSendConfirmRequest fileNum. */
        fileNum: number;

        /** FileTransferSendConfirmRequest skip. */
        skip?: (boolean|null);

        /** FileTransferSendConfirmRequest offsetBlk. */
        offsetBlk?: (number|null);

        /** FileTransferSendConfirmRequest union. */
        union?: ("skip"|"offsetBlk");

        /**
         * Creates a new FileTransferSendConfirmRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferSendConfirmRequest instance
         */
        static create(properties: hbb.FileTransferSendConfirmRequest.$Shape): hbb.FileTransferSendConfirmRequest & hbb.FileTransferSendConfirmRequest.$Shape;
        static create(properties?: hbb.FileTransferSendConfirmRequest.$Properties): hbb.FileTransferSendConfirmRequest;

        /**
         * Encodes the specified FileTransferSendConfirmRequest message. Does not implicitly {@link hbb.FileTransferSendConfirmRequest.verify|verify} messages.
         * @param message FileTransferSendConfirmRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferSendConfirmRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferSendConfirmRequest message, length delimited. Does not implicitly {@link hbb.FileTransferSendConfirmRequest.verify|verify} messages.
         * @param message FileTransferSendConfirmRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferSendConfirmRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferSendConfirmRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferSendConfirmRequest & hbb.FileTransferSendConfirmRequest.$Shape} FileTransferSendConfirmRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferSendConfirmRequest & hbb.FileTransferSendConfirmRequest.$Shape;

        /**
         * Decodes a FileTransferSendConfirmRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferSendConfirmRequest & hbb.FileTransferSendConfirmRequest.$Shape} FileTransferSendConfirmRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferSendConfirmRequest & hbb.FileTransferSendConfirmRequest.$Shape;

        /**
         * Verifies a FileTransferSendConfirmRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferSendConfirmRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferSendConfirmRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferSendConfirmRequest;

        /**
         * Creates a plain object from a FileTransferSendConfirmRequest message. Also converts values to other types if specified.
         * @param message FileTransferSendConfirmRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferSendConfirmRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferSendConfirmRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferSendConfirmRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferSendConfirmRequest {

        /** Properties of a FileTransferSendConfirmRequest. */
        interface $Properties {

            /** FileTransferSendConfirmRequest id */
            id?: (number|null);

            /** FileTransferSendConfirmRequest fileNum */
            fileNum?: (number|null);

            /** FileTransferSendConfirmRequest skip */
            skip?: (boolean|null);

            /** FileTransferSendConfirmRequest offsetBlk */
            offsetBlk?: (number|null);

            /** FileTransferSendConfirmRequest union */
            union?: ("skip"|"offsetBlk");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a FileTransferSendConfirmRequest. */
        type $Shape = {
          id?: number|null;
          fileNum?: number|null;
          skip?: boolean|null;
          offsetBlk?: number|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; skip?: null; offsetBlk?: null }|{ union?: "skip"; skip: boolean; offsetBlk?: null }|{ union?: "offsetBlk"; skip?: null; offsetBlk: number })
        );
    }

    /**
     * Properties of a FileTransferDone.
     * @deprecated Use hbb.FileTransferDone.$Properties instead.
     */
    interface IFileTransferDone extends hbb.FileTransferDone.$Properties {
    }

    /** Represents a FileTransferDone. */
    class FileTransferDone {

        /**
         * Constructs a new FileTransferDone.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferDone.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferDone id. */
        id: number;

        /** FileTransferDone fileNum. */
        fileNum: number;

        /**
         * Creates a new FileTransferDone instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferDone instance
         */
        static create(properties: hbb.FileTransferDone.$Shape): hbb.FileTransferDone & hbb.FileTransferDone.$Shape;
        static create(properties?: hbb.FileTransferDone.$Properties): hbb.FileTransferDone;

        /**
         * Encodes the specified FileTransferDone message. Does not implicitly {@link hbb.FileTransferDone.verify|verify} messages.
         * @param message FileTransferDone message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferDone.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferDone message, length delimited. Does not implicitly {@link hbb.FileTransferDone.verify|verify} messages.
         * @param message FileTransferDone message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferDone.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferDone message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferDone & hbb.FileTransferDone.$Shape} FileTransferDone
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferDone & hbb.FileTransferDone.$Shape;

        /**
         * Decodes a FileTransferDone message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferDone & hbb.FileTransferDone.$Shape} FileTransferDone
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferDone & hbb.FileTransferDone.$Shape;

        /**
         * Verifies a FileTransferDone message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferDone message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferDone
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferDone;

        /**
         * Creates a plain object from a FileTransferDone message. Also converts values to other types if specified.
         * @param message FileTransferDone
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferDone, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferDone to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferDone
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferDone {

        /** Properties of a FileTransferDone. */
        interface $Properties {

            /** FileTransferDone id */
            id?: (number|null);

            /** FileTransferDone fileNum */
            fileNum?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransferDone. */
        type $Shape = hbb.FileTransferDone.$Properties;
    }

    /**
     * Properties of a FileTransferReceiveRequest.
     * @deprecated Use hbb.FileTransferReceiveRequest.$Properties instead.
     */
    interface IFileTransferReceiveRequest extends hbb.FileTransferReceiveRequest.$Properties {
    }

    /** Represents a FileTransferReceiveRequest. */
    class FileTransferReceiveRequest {

        /**
         * Constructs a new FileTransferReceiveRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileTransferReceiveRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileTransferReceiveRequest id. */
        id: number;

        /** FileTransferReceiveRequest path. */
        path: string;

        /** FileTransferReceiveRequest files. */
        files: hbb.FileEntry.$Properties[];

        /** FileTransferReceiveRequest fileNum. */
        fileNum: number;

        /** FileTransferReceiveRequest totalSize. */
        totalSize: (number|Long);

        /**
         * Creates a new FileTransferReceiveRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileTransferReceiveRequest instance
         */
        static create(properties: hbb.FileTransferReceiveRequest.$Shape): hbb.FileTransferReceiveRequest & hbb.FileTransferReceiveRequest.$Shape;
        static create(properties?: hbb.FileTransferReceiveRequest.$Properties): hbb.FileTransferReceiveRequest;

        /**
         * Encodes the specified FileTransferReceiveRequest message. Does not implicitly {@link hbb.FileTransferReceiveRequest.verify|verify} messages.
         * @param message FileTransferReceiveRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileTransferReceiveRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileTransferReceiveRequest message, length delimited. Does not implicitly {@link hbb.FileTransferReceiveRequest.verify|verify} messages.
         * @param message FileTransferReceiveRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileTransferReceiveRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileTransferReceiveRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileTransferReceiveRequest & hbb.FileTransferReceiveRequest.$Shape} FileTransferReceiveRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileTransferReceiveRequest & hbb.FileTransferReceiveRequest.$Shape;

        /**
         * Decodes a FileTransferReceiveRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileTransferReceiveRequest & hbb.FileTransferReceiveRequest.$Shape} FileTransferReceiveRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileTransferReceiveRequest & hbb.FileTransferReceiveRequest.$Shape;

        /**
         * Verifies a FileTransferReceiveRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileTransferReceiveRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileTransferReceiveRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.FileTransferReceiveRequest;

        /**
         * Creates a plain object from a FileTransferReceiveRequest message. Also converts values to other types if specified.
         * @param message FileTransferReceiveRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileTransferReceiveRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileTransferReceiveRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileTransferReceiveRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileTransferReceiveRequest {

        /** Properties of a FileTransferReceiveRequest. */
        interface $Properties {

            /** FileTransferReceiveRequest id */
            id?: (number|null);

            /** FileTransferReceiveRequest path */
            path?: (string|null);

            /** FileTransferReceiveRequest files */
            files?: (hbb.FileEntry.$Properties[]|null);

            /** FileTransferReceiveRequest fileNum */
            fileNum?: (number|null);

            /** FileTransferReceiveRequest totalSize */
            totalSize?: (number|Long|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileTransferReceiveRequest. */
        type $Shape = hbb.FileTransferReceiveRequest.$Properties;
    }

    /**
     * Properties of a FileRemoveDir.
     * @deprecated Use hbb.FileRemoveDir.$Properties instead.
     */
    interface IFileRemoveDir extends hbb.FileRemoveDir.$Properties {
    }

    /** Represents a FileRemoveDir. */
    class FileRemoveDir {

        /**
         * Constructs a new FileRemoveDir.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileRemoveDir.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileRemoveDir id. */
        id: number;

        /** FileRemoveDir path. */
        path: string;

        /** FileRemoveDir recursive. */
        recursive: boolean;

        /**
         * Creates a new FileRemoveDir instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileRemoveDir instance
         */
        static create(properties: hbb.FileRemoveDir.$Shape): hbb.FileRemoveDir & hbb.FileRemoveDir.$Shape;
        static create(properties?: hbb.FileRemoveDir.$Properties): hbb.FileRemoveDir;

        /**
         * Encodes the specified FileRemoveDir message. Does not implicitly {@link hbb.FileRemoveDir.verify|verify} messages.
         * @param message FileRemoveDir message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileRemoveDir.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileRemoveDir message, length delimited. Does not implicitly {@link hbb.FileRemoveDir.verify|verify} messages.
         * @param message FileRemoveDir message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileRemoveDir.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileRemoveDir message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileRemoveDir & hbb.FileRemoveDir.$Shape} FileRemoveDir
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileRemoveDir & hbb.FileRemoveDir.$Shape;

        /**
         * Decodes a FileRemoveDir message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileRemoveDir & hbb.FileRemoveDir.$Shape} FileRemoveDir
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileRemoveDir & hbb.FileRemoveDir.$Shape;

        /**
         * Verifies a FileRemoveDir message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileRemoveDir message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileRemoveDir
         */
        static fromObject(object: { [k: string]: any }): hbb.FileRemoveDir;

        /**
         * Creates a plain object from a FileRemoveDir message. Also converts values to other types if specified.
         * @param message FileRemoveDir
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileRemoveDir, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileRemoveDir to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileRemoveDir
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileRemoveDir {

        /** Properties of a FileRemoveDir. */
        interface $Properties {

            /** FileRemoveDir id */
            id?: (number|null);

            /** FileRemoveDir path */
            path?: (string|null);

            /** FileRemoveDir recursive */
            recursive?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileRemoveDir. */
        type $Shape = hbb.FileRemoveDir.$Properties;
    }

    /**
     * Properties of a FileRemoveFile.
     * @deprecated Use hbb.FileRemoveFile.$Properties instead.
     */
    interface IFileRemoveFile extends hbb.FileRemoveFile.$Properties {
    }

    /** Represents a FileRemoveFile. */
    class FileRemoveFile {

        /**
         * Constructs a new FileRemoveFile.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileRemoveFile.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileRemoveFile id. */
        id: number;

        /** FileRemoveFile path. */
        path: string;

        /** FileRemoveFile fileNum. */
        fileNum: number;

        /**
         * Creates a new FileRemoveFile instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileRemoveFile instance
         */
        static create(properties: hbb.FileRemoveFile.$Shape): hbb.FileRemoveFile & hbb.FileRemoveFile.$Shape;
        static create(properties?: hbb.FileRemoveFile.$Properties): hbb.FileRemoveFile;

        /**
         * Encodes the specified FileRemoveFile message. Does not implicitly {@link hbb.FileRemoveFile.verify|verify} messages.
         * @param message FileRemoveFile message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileRemoveFile.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileRemoveFile message, length delimited. Does not implicitly {@link hbb.FileRemoveFile.verify|verify} messages.
         * @param message FileRemoveFile message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileRemoveFile.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileRemoveFile message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileRemoveFile & hbb.FileRemoveFile.$Shape} FileRemoveFile
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileRemoveFile & hbb.FileRemoveFile.$Shape;

        /**
         * Decodes a FileRemoveFile message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileRemoveFile & hbb.FileRemoveFile.$Shape} FileRemoveFile
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileRemoveFile & hbb.FileRemoveFile.$Shape;

        /**
         * Verifies a FileRemoveFile message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileRemoveFile message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileRemoveFile
         */
        static fromObject(object: { [k: string]: any }): hbb.FileRemoveFile;

        /**
         * Creates a plain object from a FileRemoveFile message. Also converts values to other types if specified.
         * @param message FileRemoveFile
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileRemoveFile, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileRemoveFile to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileRemoveFile
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileRemoveFile {

        /** Properties of a FileRemoveFile. */
        interface $Properties {

            /** FileRemoveFile id */
            id?: (number|null);

            /** FileRemoveFile path */
            path?: (string|null);

            /** FileRemoveFile fileNum */
            fileNum?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileRemoveFile. */
        type $Shape = hbb.FileRemoveFile.$Properties;
    }

    /**
     * Properties of a FileDirCreate.
     * @deprecated Use hbb.FileDirCreate.$Properties instead.
     */
    interface IFileDirCreate extends hbb.FileDirCreate.$Properties {
    }

    /** Represents a FileDirCreate. */
    class FileDirCreate {

        /**
         * Constructs a new FileDirCreate.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FileDirCreate.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FileDirCreate id. */
        id: number;

        /** FileDirCreate path. */
        path: string;

        /**
         * Creates a new FileDirCreate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FileDirCreate instance
         */
        static create(properties: hbb.FileDirCreate.$Shape): hbb.FileDirCreate & hbb.FileDirCreate.$Shape;
        static create(properties?: hbb.FileDirCreate.$Properties): hbb.FileDirCreate;

        /**
         * Encodes the specified FileDirCreate message. Does not implicitly {@link hbb.FileDirCreate.verify|verify} messages.
         * @param message FileDirCreate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FileDirCreate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FileDirCreate message, length delimited. Does not implicitly {@link hbb.FileDirCreate.verify|verify} messages.
         * @param message FileDirCreate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FileDirCreate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileDirCreate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FileDirCreate & hbb.FileDirCreate.$Shape} FileDirCreate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FileDirCreate & hbb.FileDirCreate.$Shape;

        /**
         * Decodes a FileDirCreate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FileDirCreate & hbb.FileDirCreate.$Shape} FileDirCreate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FileDirCreate & hbb.FileDirCreate.$Shape;

        /**
         * Verifies a FileDirCreate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FileDirCreate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FileDirCreate
         */
        static fromObject(object: { [k: string]: any }): hbb.FileDirCreate;

        /**
         * Creates a plain object from a FileDirCreate message. Also converts values to other types if specified.
         * @param message FileDirCreate
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FileDirCreate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FileDirCreate to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FileDirCreate
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FileDirCreate {

        /** Properties of a FileDirCreate. */
        interface $Properties {

            /** FileDirCreate id */
            id?: (number|null);

            /** FileDirCreate path */
            path?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FileDirCreate. */
        type $Shape = hbb.FileDirCreate.$Properties;
    }

    /**
     * Properties of a CliprdrMonitorReady.
     * @deprecated Use hbb.CliprdrMonitorReady.$Properties instead.
     */
    interface ICliprdrMonitorReady extends hbb.CliprdrMonitorReady.$Properties {
    }

    /** Represents a CliprdrMonitorReady. */
    class CliprdrMonitorReady {

        /**
         * Constructs a new CliprdrMonitorReady.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrMonitorReady.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /**
         * Creates a new CliprdrMonitorReady instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrMonitorReady instance
         */
        static create(properties: hbb.CliprdrMonitorReady.$Shape): hbb.CliprdrMonitorReady & hbb.CliprdrMonitorReady.$Shape;
        static create(properties?: hbb.CliprdrMonitorReady.$Properties): hbb.CliprdrMonitorReady;

        /**
         * Encodes the specified CliprdrMonitorReady message. Does not implicitly {@link hbb.CliprdrMonitorReady.verify|verify} messages.
         * @param message CliprdrMonitorReady message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrMonitorReady.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrMonitorReady message, length delimited. Does not implicitly {@link hbb.CliprdrMonitorReady.verify|verify} messages.
         * @param message CliprdrMonitorReady message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrMonitorReady.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrMonitorReady message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrMonitorReady & hbb.CliprdrMonitorReady.$Shape} CliprdrMonitorReady
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrMonitorReady & hbb.CliprdrMonitorReady.$Shape;

        /**
         * Decodes a CliprdrMonitorReady message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrMonitorReady & hbb.CliprdrMonitorReady.$Shape} CliprdrMonitorReady
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrMonitorReady & hbb.CliprdrMonitorReady.$Shape;

        /**
         * Verifies a CliprdrMonitorReady message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrMonitorReady message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrMonitorReady
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrMonitorReady;

        /**
         * Creates a plain object from a CliprdrMonitorReady message. Also converts values to other types if specified.
         * @param message CliprdrMonitorReady
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrMonitorReady, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrMonitorReady to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrMonitorReady
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrMonitorReady {

        /** Properties of a CliprdrMonitorReady. */
        interface $Properties {

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrMonitorReady. */
        type $Shape = hbb.CliprdrMonitorReady.$Properties;
    }

    /**
     * Properties of a CliprdrFormat.
     * @deprecated Use hbb.CliprdrFormat.$Properties instead.
     */
    interface ICliprdrFormat extends hbb.CliprdrFormat.$Properties {
    }

    /** Represents a CliprdrFormat. */
    class CliprdrFormat {

        /**
         * Constructs a new CliprdrFormat.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrFormat.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrFormat id. */
        id: number;

        /** CliprdrFormat format. */
        format: string;

        /**
         * Creates a new CliprdrFormat instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrFormat instance
         */
        static create(properties: hbb.CliprdrFormat.$Shape): hbb.CliprdrFormat & hbb.CliprdrFormat.$Shape;
        static create(properties?: hbb.CliprdrFormat.$Properties): hbb.CliprdrFormat;

        /**
         * Encodes the specified CliprdrFormat message. Does not implicitly {@link hbb.CliprdrFormat.verify|verify} messages.
         * @param message CliprdrFormat message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrFormat.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrFormat message, length delimited. Does not implicitly {@link hbb.CliprdrFormat.verify|verify} messages.
         * @param message CliprdrFormat message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrFormat.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrFormat message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrFormat & hbb.CliprdrFormat.$Shape} CliprdrFormat
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrFormat & hbb.CliprdrFormat.$Shape;

        /**
         * Decodes a CliprdrFormat message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrFormat & hbb.CliprdrFormat.$Shape} CliprdrFormat
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrFormat & hbb.CliprdrFormat.$Shape;

        /**
         * Verifies a CliprdrFormat message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrFormat message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrFormat
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrFormat;

        /**
         * Creates a plain object from a CliprdrFormat message. Also converts values to other types if specified.
         * @param message CliprdrFormat
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrFormat, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrFormat to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrFormat
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrFormat {

        /** Properties of a CliprdrFormat. */
        interface $Properties {

            /** CliprdrFormat id */
            id?: (number|null);

            /** CliprdrFormat format */
            format?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrFormat. */
        type $Shape = hbb.CliprdrFormat.$Properties;
    }

    /**
     * Properties of a CliprdrServerFormatList.
     * @deprecated Use hbb.CliprdrServerFormatList.$Properties instead.
     */
    interface ICliprdrServerFormatList extends hbb.CliprdrServerFormatList.$Properties {
    }

    /** Represents a CliprdrServerFormatList. */
    class CliprdrServerFormatList {

        /**
         * Constructs a new CliprdrServerFormatList.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrServerFormatList.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrServerFormatList formats. */
        formats: hbb.CliprdrFormat.$Properties[];

        /**
         * Creates a new CliprdrServerFormatList instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrServerFormatList instance
         */
        static create(properties: hbb.CliprdrServerFormatList.$Shape): hbb.CliprdrServerFormatList & hbb.CliprdrServerFormatList.$Shape;
        static create(properties?: hbb.CliprdrServerFormatList.$Properties): hbb.CliprdrServerFormatList;

        /**
         * Encodes the specified CliprdrServerFormatList message. Does not implicitly {@link hbb.CliprdrServerFormatList.verify|verify} messages.
         * @param message CliprdrServerFormatList message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrServerFormatList.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrServerFormatList message, length delimited. Does not implicitly {@link hbb.CliprdrServerFormatList.verify|verify} messages.
         * @param message CliprdrServerFormatList message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrServerFormatList.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrServerFormatList message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrServerFormatList & hbb.CliprdrServerFormatList.$Shape} CliprdrServerFormatList
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrServerFormatList & hbb.CliprdrServerFormatList.$Shape;

        /**
         * Decodes a CliprdrServerFormatList message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrServerFormatList & hbb.CliprdrServerFormatList.$Shape} CliprdrServerFormatList
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrServerFormatList & hbb.CliprdrServerFormatList.$Shape;

        /**
         * Verifies a CliprdrServerFormatList message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrServerFormatList message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrServerFormatList
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrServerFormatList;

        /**
         * Creates a plain object from a CliprdrServerFormatList message. Also converts values to other types if specified.
         * @param message CliprdrServerFormatList
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrServerFormatList, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrServerFormatList to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrServerFormatList
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrServerFormatList {

        /** Properties of a CliprdrServerFormatList. */
        interface $Properties {

            /** CliprdrServerFormatList formats */
            formats?: (hbb.CliprdrFormat.$Properties[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrServerFormatList. */
        type $Shape = hbb.CliprdrServerFormatList.$Properties;
    }

    /**
     * Properties of a CliprdrServerFormatListResponse.
     * @deprecated Use hbb.CliprdrServerFormatListResponse.$Properties instead.
     */
    interface ICliprdrServerFormatListResponse extends hbb.CliprdrServerFormatListResponse.$Properties {
    }

    /** Represents a CliprdrServerFormatListResponse. */
    class CliprdrServerFormatListResponse {

        /**
         * Constructs a new CliprdrServerFormatListResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrServerFormatListResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrServerFormatListResponse msgFlags. */
        msgFlags: number;

        /**
         * Creates a new CliprdrServerFormatListResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrServerFormatListResponse instance
         */
        static create(properties: hbb.CliprdrServerFormatListResponse.$Shape): hbb.CliprdrServerFormatListResponse & hbb.CliprdrServerFormatListResponse.$Shape;
        static create(properties?: hbb.CliprdrServerFormatListResponse.$Properties): hbb.CliprdrServerFormatListResponse;

        /**
         * Encodes the specified CliprdrServerFormatListResponse message. Does not implicitly {@link hbb.CliprdrServerFormatListResponse.verify|verify} messages.
         * @param message CliprdrServerFormatListResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrServerFormatListResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrServerFormatListResponse message, length delimited. Does not implicitly {@link hbb.CliprdrServerFormatListResponse.verify|verify} messages.
         * @param message CliprdrServerFormatListResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrServerFormatListResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrServerFormatListResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrServerFormatListResponse & hbb.CliprdrServerFormatListResponse.$Shape} CliprdrServerFormatListResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrServerFormatListResponse & hbb.CliprdrServerFormatListResponse.$Shape;

        /**
         * Decodes a CliprdrServerFormatListResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrServerFormatListResponse & hbb.CliprdrServerFormatListResponse.$Shape} CliprdrServerFormatListResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrServerFormatListResponse & hbb.CliprdrServerFormatListResponse.$Shape;

        /**
         * Verifies a CliprdrServerFormatListResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrServerFormatListResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrServerFormatListResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrServerFormatListResponse;

        /**
         * Creates a plain object from a CliprdrServerFormatListResponse message. Also converts values to other types if specified.
         * @param message CliprdrServerFormatListResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrServerFormatListResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrServerFormatListResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrServerFormatListResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrServerFormatListResponse {

        /** Properties of a CliprdrServerFormatListResponse. */
        interface $Properties {

            /** CliprdrServerFormatListResponse msgFlags */
            msgFlags?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrServerFormatListResponse. */
        type $Shape = hbb.CliprdrServerFormatListResponse.$Properties;
    }

    /**
     * Properties of a CliprdrServerFormatDataRequest.
     * @deprecated Use hbb.CliprdrServerFormatDataRequest.$Properties instead.
     */
    interface ICliprdrServerFormatDataRequest extends hbb.CliprdrServerFormatDataRequest.$Properties {
    }

    /** Represents a CliprdrServerFormatDataRequest. */
    class CliprdrServerFormatDataRequest {

        /**
         * Constructs a new CliprdrServerFormatDataRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrServerFormatDataRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrServerFormatDataRequest requestedFormatId. */
        requestedFormatId: number;

        /**
         * Creates a new CliprdrServerFormatDataRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrServerFormatDataRequest instance
         */
        static create(properties: hbb.CliprdrServerFormatDataRequest.$Shape): hbb.CliprdrServerFormatDataRequest & hbb.CliprdrServerFormatDataRequest.$Shape;
        static create(properties?: hbb.CliprdrServerFormatDataRequest.$Properties): hbb.CliprdrServerFormatDataRequest;

        /**
         * Encodes the specified CliprdrServerFormatDataRequest message. Does not implicitly {@link hbb.CliprdrServerFormatDataRequest.verify|verify} messages.
         * @param message CliprdrServerFormatDataRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrServerFormatDataRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrServerFormatDataRequest message, length delimited. Does not implicitly {@link hbb.CliprdrServerFormatDataRequest.verify|verify} messages.
         * @param message CliprdrServerFormatDataRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrServerFormatDataRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrServerFormatDataRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrServerFormatDataRequest & hbb.CliprdrServerFormatDataRequest.$Shape} CliprdrServerFormatDataRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrServerFormatDataRequest & hbb.CliprdrServerFormatDataRequest.$Shape;

        /**
         * Decodes a CliprdrServerFormatDataRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrServerFormatDataRequest & hbb.CliprdrServerFormatDataRequest.$Shape} CliprdrServerFormatDataRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrServerFormatDataRequest & hbb.CliprdrServerFormatDataRequest.$Shape;

        /**
         * Verifies a CliprdrServerFormatDataRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrServerFormatDataRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrServerFormatDataRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrServerFormatDataRequest;

        /**
         * Creates a plain object from a CliprdrServerFormatDataRequest message. Also converts values to other types if specified.
         * @param message CliprdrServerFormatDataRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrServerFormatDataRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrServerFormatDataRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrServerFormatDataRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrServerFormatDataRequest {

        /** Properties of a CliprdrServerFormatDataRequest. */
        interface $Properties {

            /** CliprdrServerFormatDataRequest requestedFormatId */
            requestedFormatId?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrServerFormatDataRequest. */
        type $Shape = hbb.CliprdrServerFormatDataRequest.$Properties;
    }

    /**
     * Properties of a CliprdrServerFormatDataResponse.
     * @deprecated Use hbb.CliprdrServerFormatDataResponse.$Properties instead.
     */
    interface ICliprdrServerFormatDataResponse extends hbb.CliprdrServerFormatDataResponse.$Properties {
    }

    /** Represents a CliprdrServerFormatDataResponse. */
    class CliprdrServerFormatDataResponse {

        /**
         * Constructs a new CliprdrServerFormatDataResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrServerFormatDataResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrServerFormatDataResponse msgFlags. */
        msgFlags: number;

        /** CliprdrServerFormatDataResponse formatData. */
        formatData: Uint8Array;

        /**
         * Creates a new CliprdrServerFormatDataResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrServerFormatDataResponse instance
         */
        static create(properties: hbb.CliprdrServerFormatDataResponse.$Shape): hbb.CliprdrServerFormatDataResponse & hbb.CliprdrServerFormatDataResponse.$Shape;
        static create(properties?: hbb.CliprdrServerFormatDataResponse.$Properties): hbb.CliprdrServerFormatDataResponse;

        /**
         * Encodes the specified CliprdrServerFormatDataResponse message. Does not implicitly {@link hbb.CliprdrServerFormatDataResponse.verify|verify} messages.
         * @param message CliprdrServerFormatDataResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrServerFormatDataResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrServerFormatDataResponse message, length delimited. Does not implicitly {@link hbb.CliprdrServerFormatDataResponse.verify|verify} messages.
         * @param message CliprdrServerFormatDataResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrServerFormatDataResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrServerFormatDataResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrServerFormatDataResponse & hbb.CliprdrServerFormatDataResponse.$Shape} CliprdrServerFormatDataResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrServerFormatDataResponse & hbb.CliprdrServerFormatDataResponse.$Shape;

        /**
         * Decodes a CliprdrServerFormatDataResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrServerFormatDataResponse & hbb.CliprdrServerFormatDataResponse.$Shape} CliprdrServerFormatDataResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrServerFormatDataResponse & hbb.CliprdrServerFormatDataResponse.$Shape;

        /**
         * Verifies a CliprdrServerFormatDataResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrServerFormatDataResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrServerFormatDataResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrServerFormatDataResponse;

        /**
         * Creates a plain object from a CliprdrServerFormatDataResponse message. Also converts values to other types if specified.
         * @param message CliprdrServerFormatDataResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrServerFormatDataResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrServerFormatDataResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrServerFormatDataResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrServerFormatDataResponse {

        /** Properties of a CliprdrServerFormatDataResponse. */
        interface $Properties {

            /** CliprdrServerFormatDataResponse msgFlags */
            msgFlags?: (number|null);

            /** CliprdrServerFormatDataResponse formatData */
            formatData?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrServerFormatDataResponse. */
        type $Shape = hbb.CliprdrServerFormatDataResponse.$Properties;
    }

    /**
     * Properties of a CliprdrFileContentsRequest.
     * @deprecated Use hbb.CliprdrFileContentsRequest.$Properties instead.
     */
    interface ICliprdrFileContentsRequest extends hbb.CliprdrFileContentsRequest.$Properties {
    }

    /** Represents a CliprdrFileContentsRequest. */
    class CliprdrFileContentsRequest {

        /**
         * Constructs a new CliprdrFileContentsRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrFileContentsRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrFileContentsRequest streamId. */
        streamId: number;

        /** CliprdrFileContentsRequest listIndex. */
        listIndex: number;

        /** CliprdrFileContentsRequest dwFlags. */
        dwFlags: number;

        /** CliprdrFileContentsRequest nPositionLow. */
        nPositionLow: number;

        /** CliprdrFileContentsRequest nPositionHigh. */
        nPositionHigh: number;

        /** CliprdrFileContentsRequest cbRequested. */
        cbRequested: number;

        /** CliprdrFileContentsRequest haveClipDataId. */
        haveClipDataId: boolean;

        /** CliprdrFileContentsRequest clipDataId. */
        clipDataId: number;

        /**
         * Creates a new CliprdrFileContentsRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrFileContentsRequest instance
         */
        static create(properties: hbb.CliprdrFileContentsRequest.$Shape): hbb.CliprdrFileContentsRequest & hbb.CliprdrFileContentsRequest.$Shape;
        static create(properties?: hbb.CliprdrFileContentsRequest.$Properties): hbb.CliprdrFileContentsRequest;

        /**
         * Encodes the specified CliprdrFileContentsRequest message. Does not implicitly {@link hbb.CliprdrFileContentsRequest.verify|verify} messages.
         * @param message CliprdrFileContentsRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrFileContentsRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrFileContentsRequest message, length delimited. Does not implicitly {@link hbb.CliprdrFileContentsRequest.verify|verify} messages.
         * @param message CliprdrFileContentsRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrFileContentsRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrFileContentsRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrFileContentsRequest & hbb.CliprdrFileContentsRequest.$Shape} CliprdrFileContentsRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrFileContentsRequest & hbb.CliprdrFileContentsRequest.$Shape;

        /**
         * Decodes a CliprdrFileContentsRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrFileContentsRequest & hbb.CliprdrFileContentsRequest.$Shape} CliprdrFileContentsRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrFileContentsRequest & hbb.CliprdrFileContentsRequest.$Shape;

        /**
         * Verifies a CliprdrFileContentsRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrFileContentsRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrFileContentsRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrFileContentsRequest;

        /**
         * Creates a plain object from a CliprdrFileContentsRequest message. Also converts values to other types if specified.
         * @param message CliprdrFileContentsRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrFileContentsRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrFileContentsRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrFileContentsRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrFileContentsRequest {

        /** Properties of a CliprdrFileContentsRequest. */
        interface $Properties {

            /** CliprdrFileContentsRequest streamId */
            streamId?: (number|null);

            /** CliprdrFileContentsRequest listIndex */
            listIndex?: (number|null);

            /** CliprdrFileContentsRequest dwFlags */
            dwFlags?: (number|null);

            /** CliprdrFileContentsRequest nPositionLow */
            nPositionLow?: (number|null);

            /** CliprdrFileContentsRequest nPositionHigh */
            nPositionHigh?: (number|null);

            /** CliprdrFileContentsRequest cbRequested */
            cbRequested?: (number|null);

            /** CliprdrFileContentsRequest haveClipDataId */
            haveClipDataId?: (boolean|null);

            /** CliprdrFileContentsRequest clipDataId */
            clipDataId?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrFileContentsRequest. */
        type $Shape = hbb.CliprdrFileContentsRequest.$Properties;
    }

    /**
     * Properties of a CliprdrFileContentsResponse.
     * @deprecated Use hbb.CliprdrFileContentsResponse.$Properties instead.
     */
    interface ICliprdrFileContentsResponse extends hbb.CliprdrFileContentsResponse.$Properties {
    }

    /** Represents a CliprdrFileContentsResponse. */
    class CliprdrFileContentsResponse {

        /**
         * Constructs a new CliprdrFileContentsResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrFileContentsResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrFileContentsResponse msgFlags. */
        msgFlags: number;

        /** CliprdrFileContentsResponse streamId. */
        streamId: number;

        /** CliprdrFileContentsResponse requestedData. */
        requestedData: Uint8Array;

        /**
         * Creates a new CliprdrFileContentsResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrFileContentsResponse instance
         */
        static create(properties: hbb.CliprdrFileContentsResponse.$Shape): hbb.CliprdrFileContentsResponse & hbb.CliprdrFileContentsResponse.$Shape;
        static create(properties?: hbb.CliprdrFileContentsResponse.$Properties): hbb.CliprdrFileContentsResponse;

        /**
         * Encodes the specified CliprdrFileContentsResponse message. Does not implicitly {@link hbb.CliprdrFileContentsResponse.verify|verify} messages.
         * @param message CliprdrFileContentsResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrFileContentsResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrFileContentsResponse message, length delimited. Does not implicitly {@link hbb.CliprdrFileContentsResponse.verify|verify} messages.
         * @param message CliprdrFileContentsResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrFileContentsResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrFileContentsResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrFileContentsResponse & hbb.CliprdrFileContentsResponse.$Shape} CliprdrFileContentsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrFileContentsResponse & hbb.CliprdrFileContentsResponse.$Shape;

        /**
         * Decodes a CliprdrFileContentsResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrFileContentsResponse & hbb.CliprdrFileContentsResponse.$Shape} CliprdrFileContentsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrFileContentsResponse & hbb.CliprdrFileContentsResponse.$Shape;

        /**
         * Verifies a CliprdrFileContentsResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrFileContentsResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrFileContentsResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrFileContentsResponse;

        /**
         * Creates a plain object from a CliprdrFileContentsResponse message. Also converts values to other types if specified.
         * @param message CliprdrFileContentsResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrFileContentsResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrFileContentsResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrFileContentsResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrFileContentsResponse {

        /** Properties of a CliprdrFileContentsResponse. */
        interface $Properties {

            /** CliprdrFileContentsResponse msgFlags */
            msgFlags?: (number|null);

            /** CliprdrFileContentsResponse streamId */
            streamId?: (number|null);

            /** CliprdrFileContentsResponse requestedData */
            requestedData?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrFileContentsResponse. */
        type $Shape = hbb.CliprdrFileContentsResponse.$Properties;
    }

    /**
     * Properties of a CliprdrTryEmpty.
     * @deprecated Use hbb.CliprdrTryEmpty.$Properties instead.
     */
    interface ICliprdrTryEmpty extends hbb.CliprdrTryEmpty.$Properties {
    }

    /** Represents a CliprdrTryEmpty. */
    class CliprdrTryEmpty {

        /**
         * Constructs a new CliprdrTryEmpty.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrTryEmpty.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /**
         * Creates a new CliprdrTryEmpty instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrTryEmpty instance
         */
        static create(properties: hbb.CliprdrTryEmpty.$Shape): hbb.CliprdrTryEmpty & hbb.CliprdrTryEmpty.$Shape;
        static create(properties?: hbb.CliprdrTryEmpty.$Properties): hbb.CliprdrTryEmpty;

        /**
         * Encodes the specified CliprdrTryEmpty message. Does not implicitly {@link hbb.CliprdrTryEmpty.verify|verify} messages.
         * @param message CliprdrTryEmpty message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrTryEmpty.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrTryEmpty message, length delimited. Does not implicitly {@link hbb.CliprdrTryEmpty.verify|verify} messages.
         * @param message CliprdrTryEmpty message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrTryEmpty.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrTryEmpty message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrTryEmpty & hbb.CliprdrTryEmpty.$Shape} CliprdrTryEmpty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrTryEmpty & hbb.CliprdrTryEmpty.$Shape;

        /**
         * Decodes a CliprdrTryEmpty message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrTryEmpty & hbb.CliprdrTryEmpty.$Shape} CliprdrTryEmpty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrTryEmpty & hbb.CliprdrTryEmpty.$Shape;

        /**
         * Verifies a CliprdrTryEmpty message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrTryEmpty message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrTryEmpty
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrTryEmpty;

        /**
         * Creates a plain object from a CliprdrTryEmpty message. Also converts values to other types if specified.
         * @param message CliprdrTryEmpty
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrTryEmpty, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrTryEmpty to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrTryEmpty
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrTryEmpty {

        /** Properties of a CliprdrTryEmpty. */
        interface $Properties {

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrTryEmpty. */
        type $Shape = hbb.CliprdrTryEmpty.$Properties;
    }

    /**
     * Properties of a CliprdrFile.
     * @deprecated Use hbb.CliprdrFile.$Properties instead.
     */
    interface ICliprdrFile extends hbb.CliprdrFile.$Properties {
    }

    /** Represents a CliprdrFile. */
    class CliprdrFile {

        /**
         * Constructs a new CliprdrFile.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrFile.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrFile name. */
        name: string;

        /** CliprdrFile size. */
        size: (number|Long);

        /**
         * Creates a new CliprdrFile instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrFile instance
         */
        static create(properties: hbb.CliprdrFile.$Shape): hbb.CliprdrFile & hbb.CliprdrFile.$Shape;
        static create(properties?: hbb.CliprdrFile.$Properties): hbb.CliprdrFile;

        /**
         * Encodes the specified CliprdrFile message. Does not implicitly {@link hbb.CliprdrFile.verify|verify} messages.
         * @param message CliprdrFile message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrFile.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrFile message, length delimited. Does not implicitly {@link hbb.CliprdrFile.verify|verify} messages.
         * @param message CliprdrFile message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrFile.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrFile message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrFile & hbb.CliprdrFile.$Shape} CliprdrFile
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrFile & hbb.CliprdrFile.$Shape;

        /**
         * Decodes a CliprdrFile message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrFile & hbb.CliprdrFile.$Shape} CliprdrFile
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrFile & hbb.CliprdrFile.$Shape;

        /**
         * Verifies a CliprdrFile message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrFile message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrFile
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrFile;

        /**
         * Creates a plain object from a CliprdrFile message. Also converts values to other types if specified.
         * @param message CliprdrFile
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrFile, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrFile to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrFile
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrFile {

        /** Properties of a CliprdrFile. */
        interface $Properties {

            /** CliprdrFile name */
            name?: (string|null);

            /** CliprdrFile size */
            size?: (number|Long|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrFile. */
        type $Shape = hbb.CliprdrFile.$Properties;
    }

    /**
     * Properties of a CliprdrFiles.
     * @deprecated Use hbb.CliprdrFiles.$Properties instead.
     */
    interface ICliprdrFiles extends hbb.CliprdrFiles.$Properties {
    }

    /** Represents a CliprdrFiles. */
    class CliprdrFiles {

        /**
         * Constructs a new CliprdrFiles.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CliprdrFiles.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CliprdrFiles files. */
        files: hbb.CliprdrFile.$Properties[];

        /**
         * Creates a new CliprdrFiles instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CliprdrFiles instance
         */
        static create(properties: hbb.CliprdrFiles.$Shape): hbb.CliprdrFiles & hbb.CliprdrFiles.$Shape;
        static create(properties?: hbb.CliprdrFiles.$Properties): hbb.CliprdrFiles;

        /**
         * Encodes the specified CliprdrFiles message. Does not implicitly {@link hbb.CliprdrFiles.verify|verify} messages.
         * @param message CliprdrFiles message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CliprdrFiles.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CliprdrFiles message, length delimited. Does not implicitly {@link hbb.CliprdrFiles.verify|verify} messages.
         * @param message CliprdrFiles message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CliprdrFiles.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CliprdrFiles message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CliprdrFiles & hbb.CliprdrFiles.$Shape} CliprdrFiles
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CliprdrFiles & hbb.CliprdrFiles.$Shape;

        /**
         * Decodes a CliprdrFiles message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CliprdrFiles & hbb.CliprdrFiles.$Shape} CliprdrFiles
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CliprdrFiles & hbb.CliprdrFiles.$Shape;

        /**
         * Verifies a CliprdrFiles message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CliprdrFiles message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CliprdrFiles
         */
        static fromObject(object: { [k: string]: any }): hbb.CliprdrFiles;

        /**
         * Creates a plain object from a CliprdrFiles message. Also converts values to other types if specified.
         * @param message CliprdrFiles
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CliprdrFiles, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CliprdrFiles to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CliprdrFiles
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CliprdrFiles {

        /** Properties of a CliprdrFiles. */
        interface $Properties {

            /** CliprdrFiles files */
            files?: (hbb.CliprdrFile.$Properties[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CliprdrFiles. */
        type $Shape = hbb.CliprdrFiles.$Properties;
    }

    /**
     * Properties of a Cliprdr.
     * @deprecated Use hbb.Cliprdr.$Properties instead.
     */
    interface ICliprdr extends hbb.Cliprdr.$Properties {
    }

    /** Represents a Cliprdr. */
    class Cliprdr {

        /**
         * Constructs a new Cliprdr.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Cliprdr.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Cliprdr ready. */
        ready?: (hbb.CliprdrMonitorReady.$Properties|null);

        /** Cliprdr formatList. */
        formatList?: (hbb.CliprdrServerFormatList.$Properties|null);

        /** Cliprdr formatListResponse. */
        formatListResponse?: (hbb.CliprdrServerFormatListResponse.$Properties|null);

        /** Cliprdr formatDataRequest. */
        formatDataRequest?: (hbb.CliprdrServerFormatDataRequest.$Properties|null);

        /** Cliprdr formatDataResponse. */
        formatDataResponse?: (hbb.CliprdrServerFormatDataResponse.$Properties|null);

        /** Cliprdr fileContentsRequest. */
        fileContentsRequest?: (hbb.CliprdrFileContentsRequest.$Properties|null);

        /** Cliprdr fileContentsResponse. */
        fileContentsResponse?: (hbb.CliprdrFileContentsResponse.$Properties|null);

        /** Cliprdr tryEmpty. */
        tryEmpty?: (hbb.CliprdrTryEmpty.$Properties|null);

        /** Cliprdr files. */
        files?: (hbb.CliprdrFiles.$Properties|null);

        /** Cliprdr union. */
        union?: ("ready"|"formatList"|"formatListResponse"|"formatDataRequest"|"formatDataResponse"|"fileContentsRequest"|"fileContentsResponse"|"tryEmpty"|"files");

        /**
         * Creates a new Cliprdr instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Cliprdr instance
         */
        static create(properties: hbb.Cliprdr.$Shape): hbb.Cliprdr & hbb.Cliprdr.$Shape;
        static create(properties?: hbb.Cliprdr.$Properties): hbb.Cliprdr;

        /**
         * Encodes the specified Cliprdr message. Does not implicitly {@link hbb.Cliprdr.verify|verify} messages.
         * @param message Cliprdr message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Cliprdr.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Cliprdr message, length delimited. Does not implicitly {@link hbb.Cliprdr.verify|verify} messages.
         * @param message Cliprdr message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Cliprdr.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Cliprdr message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Cliprdr & hbb.Cliprdr.$Shape} Cliprdr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Cliprdr & hbb.Cliprdr.$Shape;

        /**
         * Decodes a Cliprdr message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Cliprdr & hbb.Cliprdr.$Shape} Cliprdr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Cliprdr & hbb.Cliprdr.$Shape;

        /**
         * Verifies a Cliprdr message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Cliprdr message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Cliprdr
         */
        static fromObject(object: { [k: string]: any }): hbb.Cliprdr;

        /**
         * Creates a plain object from a Cliprdr message. Also converts values to other types if specified.
         * @param message Cliprdr
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Cliprdr, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Cliprdr to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Cliprdr
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Cliprdr {

        /** Properties of a Cliprdr. */
        interface $Properties {

            /** Cliprdr ready */
            ready?: (hbb.CliprdrMonitorReady.$Properties|null);

            /** Cliprdr formatList */
            formatList?: (hbb.CliprdrServerFormatList.$Properties|null);

            /** Cliprdr formatListResponse */
            formatListResponse?: (hbb.CliprdrServerFormatListResponse.$Properties|null);

            /** Cliprdr formatDataRequest */
            formatDataRequest?: (hbb.CliprdrServerFormatDataRequest.$Properties|null);

            /** Cliprdr formatDataResponse */
            formatDataResponse?: (hbb.CliprdrServerFormatDataResponse.$Properties|null);

            /** Cliprdr fileContentsRequest */
            fileContentsRequest?: (hbb.CliprdrFileContentsRequest.$Properties|null);

            /** Cliprdr fileContentsResponse */
            fileContentsResponse?: (hbb.CliprdrFileContentsResponse.$Properties|null);

            /** Cliprdr tryEmpty */
            tryEmpty?: (hbb.CliprdrTryEmpty.$Properties|null);

            /** Cliprdr files */
            files?: (hbb.CliprdrFiles.$Properties|null);

            /** Cliprdr union */
            union?: ("ready"|"formatList"|"formatListResponse"|"formatDataRequest"|"formatDataResponse"|"fileContentsRequest"|"fileContentsResponse"|"tryEmpty"|"files");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a Cliprdr. */
        type $Shape = {
          ready?: hbb.CliprdrMonitorReady.$Shape|null;
          formatList?: hbb.CliprdrServerFormatList.$Shape|null;
          formatListResponse?: hbb.CliprdrServerFormatListResponse.$Shape|null;
          formatDataRequest?: hbb.CliprdrServerFormatDataRequest.$Shape|null;
          formatDataResponse?: hbb.CliprdrServerFormatDataResponse.$Shape|null;
          fileContentsRequest?: hbb.CliprdrFileContentsRequest.$Shape|null;
          fileContentsResponse?: hbb.CliprdrFileContentsResponse.$Shape|null;
          tryEmpty?: hbb.CliprdrTryEmpty.$Shape|null;
          files?: hbb.CliprdrFiles.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; ready?: null; formatList?: null; formatListResponse?: null; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty?: null; files?: null }|{ union?: "ready"; ready: hbb.CliprdrMonitorReady.$Shape; formatList?: null; formatListResponse?: null; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty?: null; files?: null }|{ union?: "formatList"; ready?: null; formatList: hbb.CliprdrServerFormatList.$Shape; formatListResponse?: null; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty?: null; files?: null }|{ union?: "formatListResponse"; ready?: null; formatList?: null; formatListResponse: hbb.CliprdrServerFormatListResponse.$Shape; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty?: null; files?: null }|{ union?: "formatDataRequest"; ready?: null; formatList?: null; formatListResponse?: null; formatDataRequest: hbb.CliprdrServerFormatDataRequest.$Shape; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty?: null; files?: null }|{ union?: "formatDataResponse"; ready?: null; formatList?: null; formatListResponse?: null; formatDataRequest?: null; formatDataResponse: hbb.CliprdrServerFormatDataResponse.$Shape; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty?: null; files?: null }|{ union?: "fileContentsRequest"; ready?: null; formatList?: null; formatListResponse?: null; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest: hbb.CliprdrFileContentsRequest.$Shape; fileContentsResponse?: null; tryEmpty?: null; files?: null }|{ union?: "fileContentsResponse"; ready?: null; formatList?: null; formatListResponse?: null; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse: hbb.CliprdrFileContentsResponse.$Shape; tryEmpty?: null; files?: null }|{ union?: "tryEmpty"; ready?: null; formatList?: null; formatListResponse?: null; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty: hbb.CliprdrTryEmpty.$Shape; files?: null }|{ union?: "files"; ready?: null; formatList?: null; formatListResponse?: null; formatDataRequest?: null; formatDataResponse?: null; fileContentsRequest?: null; fileContentsResponse?: null; tryEmpty?: null; files: hbb.CliprdrFiles.$Shape })
        );
    }

    /**
     * Properties of a Resolution.
     * @deprecated Use hbb.Resolution.$Properties instead.
     */
    interface IResolution extends hbb.Resolution.$Properties {
    }

    /** Represents a Resolution. */
    class Resolution {

        /**
         * Constructs a new Resolution.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Resolution.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Resolution width. */
        width: number;

        /** Resolution height. */
        height: number;

        /**
         * Creates a new Resolution instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Resolution instance
         */
        static create(properties: hbb.Resolution.$Shape): hbb.Resolution & hbb.Resolution.$Shape;
        static create(properties?: hbb.Resolution.$Properties): hbb.Resolution;

        /**
         * Encodes the specified Resolution message. Does not implicitly {@link hbb.Resolution.verify|verify} messages.
         * @param message Resolution message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Resolution.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Resolution message, length delimited. Does not implicitly {@link hbb.Resolution.verify|verify} messages.
         * @param message Resolution message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Resolution.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Resolution message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Resolution & hbb.Resolution.$Shape} Resolution
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Resolution & hbb.Resolution.$Shape;

        /**
         * Decodes a Resolution message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Resolution & hbb.Resolution.$Shape} Resolution
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Resolution & hbb.Resolution.$Shape;

        /**
         * Verifies a Resolution message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Resolution message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Resolution
         */
        static fromObject(object: { [k: string]: any }): hbb.Resolution;

        /**
         * Creates a plain object from a Resolution message. Also converts values to other types if specified.
         * @param message Resolution
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Resolution, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Resolution to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Resolution
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Resolution {

        /** Properties of a Resolution. */
        interface $Properties {

            /** Resolution width */
            width?: (number|null);

            /** Resolution height */
            height?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a Resolution. */
        type $Shape = hbb.Resolution.$Properties;
    }

    /**
     * Properties of a DisplayResolution.
     * @deprecated Use hbb.DisplayResolution.$Properties instead.
     */
    interface IDisplayResolution extends hbb.DisplayResolution.$Properties {
    }

    /** Represents a DisplayResolution. */
    class DisplayResolution {

        /**
         * Constructs a new DisplayResolution.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.DisplayResolution.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** DisplayResolution display. */
        display: number;

        /** DisplayResolution resolution. */
        resolution?: (hbb.Resolution.$Properties|null);

        /**
         * Creates a new DisplayResolution instance using the specified properties.
         * @param [properties] Properties to set
         * @returns DisplayResolution instance
         */
        static create(properties: hbb.DisplayResolution.$Shape): hbb.DisplayResolution & hbb.DisplayResolution.$Shape;
        static create(properties?: hbb.DisplayResolution.$Properties): hbb.DisplayResolution;

        /**
         * Encodes the specified DisplayResolution message. Does not implicitly {@link hbb.DisplayResolution.verify|verify} messages.
         * @param message DisplayResolution message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.DisplayResolution.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified DisplayResolution message, length delimited. Does not implicitly {@link hbb.DisplayResolution.verify|verify} messages.
         * @param message DisplayResolution message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.DisplayResolution.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a DisplayResolution message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.DisplayResolution & hbb.DisplayResolution.$Shape} DisplayResolution
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.DisplayResolution & hbb.DisplayResolution.$Shape;

        /**
         * Decodes a DisplayResolution message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.DisplayResolution & hbb.DisplayResolution.$Shape} DisplayResolution
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.DisplayResolution & hbb.DisplayResolution.$Shape;

        /**
         * Verifies a DisplayResolution message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a DisplayResolution message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns DisplayResolution
         */
        static fromObject(object: { [k: string]: any }): hbb.DisplayResolution;

        /**
         * Creates a plain object from a DisplayResolution message. Also converts values to other types if specified.
         * @param message DisplayResolution
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.DisplayResolution, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this DisplayResolution to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for DisplayResolution
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace DisplayResolution {

        /** Properties of a DisplayResolution. */
        interface $Properties {

            /** DisplayResolution display */
            display?: (number|null);

            /** DisplayResolution resolution */
            resolution?: (hbb.Resolution.$Properties|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a DisplayResolution. */
        type $Shape = hbb.DisplayResolution.$Properties;
    }

    /**
     * Properties of a SupportedResolutions.
     * @deprecated Use hbb.SupportedResolutions.$Properties instead.
     */
    interface ISupportedResolutions extends hbb.SupportedResolutions.$Properties {
    }

    /** Represents a SupportedResolutions. */
    class SupportedResolutions {

        /**
         * Constructs a new SupportedResolutions.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SupportedResolutions.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SupportedResolutions resolutions. */
        resolutions: hbb.Resolution.$Properties[];

        /**
         * Creates a new SupportedResolutions instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SupportedResolutions instance
         */
        static create(properties: hbb.SupportedResolutions.$Shape): hbb.SupportedResolutions & hbb.SupportedResolutions.$Shape;
        static create(properties?: hbb.SupportedResolutions.$Properties): hbb.SupportedResolutions;

        /**
         * Encodes the specified SupportedResolutions message. Does not implicitly {@link hbb.SupportedResolutions.verify|verify} messages.
         * @param message SupportedResolutions message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SupportedResolutions.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SupportedResolutions message, length delimited. Does not implicitly {@link hbb.SupportedResolutions.verify|verify} messages.
         * @param message SupportedResolutions message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SupportedResolutions.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SupportedResolutions message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SupportedResolutions & hbb.SupportedResolutions.$Shape} SupportedResolutions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SupportedResolutions & hbb.SupportedResolutions.$Shape;

        /**
         * Decodes a SupportedResolutions message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SupportedResolutions & hbb.SupportedResolutions.$Shape} SupportedResolutions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SupportedResolutions & hbb.SupportedResolutions.$Shape;

        /**
         * Verifies a SupportedResolutions message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SupportedResolutions message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SupportedResolutions
         */
        static fromObject(object: { [k: string]: any }): hbb.SupportedResolutions;

        /**
         * Creates a plain object from a SupportedResolutions message. Also converts values to other types if specified.
         * @param message SupportedResolutions
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SupportedResolutions, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SupportedResolutions to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SupportedResolutions
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SupportedResolutions {

        /** Properties of a SupportedResolutions. */
        interface $Properties {

            /** SupportedResolutions resolutions */
            resolutions?: (hbb.Resolution.$Properties[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SupportedResolutions. */
        type $Shape = hbb.SupportedResolutions.$Properties;
    }

    /**
     * Properties of a SwitchDisplay.
     * @deprecated Use hbb.SwitchDisplay.$Properties instead.
     */
    interface ISwitchDisplay extends hbb.SwitchDisplay.$Properties {
    }

    /** Represents a SwitchDisplay. */
    class SwitchDisplay {

        /**
         * Constructs a new SwitchDisplay.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SwitchDisplay.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SwitchDisplay display. */
        display: number;

        /** SwitchDisplay x. */
        x: number;

        /** SwitchDisplay y. */
        y: number;

        /** SwitchDisplay width. */
        width: number;

        /** SwitchDisplay height. */
        height: number;

        /** SwitchDisplay cursorEmbedded. */
        cursorEmbedded: boolean;

        /** SwitchDisplay resolutions. */
        resolutions?: (hbb.SupportedResolutions.$Properties|null);

        /** SwitchDisplay originalResolution. */
        originalResolution?: (hbb.Resolution.$Properties|null);

        /**
         * Creates a new SwitchDisplay instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SwitchDisplay instance
         */
        static create(properties: hbb.SwitchDisplay.$Shape): hbb.SwitchDisplay & hbb.SwitchDisplay.$Shape;
        static create(properties?: hbb.SwitchDisplay.$Properties): hbb.SwitchDisplay;

        /**
         * Encodes the specified SwitchDisplay message. Does not implicitly {@link hbb.SwitchDisplay.verify|verify} messages.
         * @param message SwitchDisplay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SwitchDisplay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SwitchDisplay message, length delimited. Does not implicitly {@link hbb.SwitchDisplay.verify|verify} messages.
         * @param message SwitchDisplay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SwitchDisplay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SwitchDisplay message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SwitchDisplay & hbb.SwitchDisplay.$Shape} SwitchDisplay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SwitchDisplay & hbb.SwitchDisplay.$Shape;

        /**
         * Decodes a SwitchDisplay message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SwitchDisplay & hbb.SwitchDisplay.$Shape} SwitchDisplay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SwitchDisplay & hbb.SwitchDisplay.$Shape;

        /**
         * Verifies a SwitchDisplay message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SwitchDisplay message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SwitchDisplay
         */
        static fromObject(object: { [k: string]: any }): hbb.SwitchDisplay;

        /**
         * Creates a plain object from a SwitchDisplay message. Also converts values to other types if specified.
         * @param message SwitchDisplay
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SwitchDisplay, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SwitchDisplay to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SwitchDisplay
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SwitchDisplay {

        /** Properties of a SwitchDisplay. */
        interface $Properties {

            /** SwitchDisplay display */
            display?: (number|null);

            /** SwitchDisplay x */
            x?: (number|null);

            /** SwitchDisplay y */
            y?: (number|null);

            /** SwitchDisplay width */
            width?: (number|null);

            /** SwitchDisplay height */
            height?: (number|null);

            /** SwitchDisplay cursorEmbedded */
            cursorEmbedded?: (boolean|null);

            /** SwitchDisplay resolutions */
            resolutions?: (hbb.SupportedResolutions.$Properties|null);

            /** SwitchDisplay originalResolution */
            originalResolution?: (hbb.Resolution.$Properties|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SwitchDisplay. */
        type $Shape = hbb.SwitchDisplay.$Properties;
    }

    /**
     * Properties of a CaptureDisplays.
     * @deprecated Use hbb.CaptureDisplays.$Properties instead.
     */
    interface ICaptureDisplays extends hbb.CaptureDisplays.$Properties {
    }

    /** Represents a CaptureDisplays. */
    class CaptureDisplays {

        /**
         * Constructs a new CaptureDisplays.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CaptureDisplays.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CaptureDisplays add. */
        add: number[];

        /** CaptureDisplays sub. */
        sub: number[];

        /** CaptureDisplays set. */
        set: number[];

        /**
         * Creates a new CaptureDisplays instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CaptureDisplays instance
         */
        static create(properties: hbb.CaptureDisplays.$Shape): hbb.CaptureDisplays & hbb.CaptureDisplays.$Shape;
        static create(properties?: hbb.CaptureDisplays.$Properties): hbb.CaptureDisplays;

        /**
         * Encodes the specified CaptureDisplays message. Does not implicitly {@link hbb.CaptureDisplays.verify|verify} messages.
         * @param message CaptureDisplays message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CaptureDisplays.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CaptureDisplays message, length delimited. Does not implicitly {@link hbb.CaptureDisplays.verify|verify} messages.
         * @param message CaptureDisplays message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CaptureDisplays.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CaptureDisplays message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CaptureDisplays & hbb.CaptureDisplays.$Shape} CaptureDisplays
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CaptureDisplays & hbb.CaptureDisplays.$Shape;

        /**
         * Decodes a CaptureDisplays message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CaptureDisplays & hbb.CaptureDisplays.$Shape} CaptureDisplays
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CaptureDisplays & hbb.CaptureDisplays.$Shape;

        /**
         * Verifies a CaptureDisplays message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CaptureDisplays message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CaptureDisplays
         */
        static fromObject(object: { [k: string]: any }): hbb.CaptureDisplays;

        /**
         * Creates a plain object from a CaptureDisplays message. Also converts values to other types if specified.
         * @param message CaptureDisplays
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CaptureDisplays, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CaptureDisplays to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CaptureDisplays
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CaptureDisplays {

        /** Properties of a CaptureDisplays. */
        interface $Properties {

            /** CaptureDisplays add */
            add?: (number[]|null);

            /** CaptureDisplays sub */
            sub?: (number[]|null);

            /** CaptureDisplays set */
            set?: (number[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CaptureDisplays. */
        type $Shape = hbb.CaptureDisplays.$Properties;
    }

    /**
     * Properties of a ToggleVirtualDisplay.
     * @deprecated Use hbb.ToggleVirtualDisplay.$Properties instead.
     */
    interface IToggleVirtualDisplay extends hbb.ToggleVirtualDisplay.$Properties {
    }

    /** Represents a ToggleVirtualDisplay. */
    class ToggleVirtualDisplay {

        /**
         * Constructs a new ToggleVirtualDisplay.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ToggleVirtualDisplay.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ToggleVirtualDisplay display. */
        display: number;

        /** ToggleVirtualDisplay on. */
        on: boolean;

        /**
         * Creates a new ToggleVirtualDisplay instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ToggleVirtualDisplay instance
         */
        static create(properties: hbb.ToggleVirtualDisplay.$Shape): hbb.ToggleVirtualDisplay & hbb.ToggleVirtualDisplay.$Shape;
        static create(properties?: hbb.ToggleVirtualDisplay.$Properties): hbb.ToggleVirtualDisplay;

        /**
         * Encodes the specified ToggleVirtualDisplay message. Does not implicitly {@link hbb.ToggleVirtualDisplay.verify|verify} messages.
         * @param message ToggleVirtualDisplay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ToggleVirtualDisplay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ToggleVirtualDisplay message, length delimited. Does not implicitly {@link hbb.ToggleVirtualDisplay.verify|verify} messages.
         * @param message ToggleVirtualDisplay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ToggleVirtualDisplay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ToggleVirtualDisplay message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ToggleVirtualDisplay & hbb.ToggleVirtualDisplay.$Shape} ToggleVirtualDisplay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ToggleVirtualDisplay & hbb.ToggleVirtualDisplay.$Shape;

        /**
         * Decodes a ToggleVirtualDisplay message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ToggleVirtualDisplay & hbb.ToggleVirtualDisplay.$Shape} ToggleVirtualDisplay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ToggleVirtualDisplay & hbb.ToggleVirtualDisplay.$Shape;

        /**
         * Verifies a ToggleVirtualDisplay message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ToggleVirtualDisplay message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ToggleVirtualDisplay
         */
        static fromObject(object: { [k: string]: any }): hbb.ToggleVirtualDisplay;

        /**
         * Creates a plain object from a ToggleVirtualDisplay message. Also converts values to other types if specified.
         * @param message ToggleVirtualDisplay
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ToggleVirtualDisplay, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ToggleVirtualDisplay to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ToggleVirtualDisplay
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ToggleVirtualDisplay {

        /** Properties of a ToggleVirtualDisplay. */
        interface $Properties {

            /** ToggleVirtualDisplay display */
            display?: (number|null);

            /** ToggleVirtualDisplay on */
            on?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ToggleVirtualDisplay. */
        type $Shape = hbb.ToggleVirtualDisplay.$Properties;
    }

    /**
     * Properties of a TogglePrivacyMode.
     * @deprecated Use hbb.TogglePrivacyMode.$Properties instead.
     */
    interface ITogglePrivacyMode extends hbb.TogglePrivacyMode.$Properties {
    }

    /** Represents a TogglePrivacyMode. */
    class TogglePrivacyMode {

        /**
         * Constructs a new TogglePrivacyMode.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TogglePrivacyMode.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TogglePrivacyMode implKey. */
        implKey: string;

        /** TogglePrivacyMode on. */
        on: boolean;

        /**
         * Creates a new TogglePrivacyMode instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TogglePrivacyMode instance
         */
        static create(properties: hbb.TogglePrivacyMode.$Shape): hbb.TogglePrivacyMode & hbb.TogglePrivacyMode.$Shape;
        static create(properties?: hbb.TogglePrivacyMode.$Properties): hbb.TogglePrivacyMode;

        /**
         * Encodes the specified TogglePrivacyMode message. Does not implicitly {@link hbb.TogglePrivacyMode.verify|verify} messages.
         * @param message TogglePrivacyMode message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TogglePrivacyMode.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TogglePrivacyMode message, length delimited. Does not implicitly {@link hbb.TogglePrivacyMode.verify|verify} messages.
         * @param message TogglePrivacyMode message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TogglePrivacyMode.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TogglePrivacyMode message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TogglePrivacyMode & hbb.TogglePrivacyMode.$Shape} TogglePrivacyMode
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TogglePrivacyMode & hbb.TogglePrivacyMode.$Shape;

        /**
         * Decodes a TogglePrivacyMode message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TogglePrivacyMode & hbb.TogglePrivacyMode.$Shape} TogglePrivacyMode
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TogglePrivacyMode & hbb.TogglePrivacyMode.$Shape;

        /**
         * Verifies a TogglePrivacyMode message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TogglePrivacyMode message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TogglePrivacyMode
         */
        static fromObject(object: { [k: string]: any }): hbb.TogglePrivacyMode;

        /**
         * Creates a plain object from a TogglePrivacyMode message. Also converts values to other types if specified.
         * @param message TogglePrivacyMode
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TogglePrivacyMode, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TogglePrivacyMode to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TogglePrivacyMode
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TogglePrivacyMode {

        /** Properties of a TogglePrivacyMode. */
        interface $Properties {

            /** TogglePrivacyMode implKey */
            implKey?: (string|null);

            /** TogglePrivacyMode on */
            on?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TogglePrivacyMode. */
        type $Shape = hbb.TogglePrivacyMode.$Properties;
    }

    /**
     * Properties of a PermissionInfo.
     * @deprecated Use hbb.PermissionInfo.$Properties instead.
     */
    interface IPermissionInfo extends hbb.PermissionInfo.$Properties {
    }

    /** Represents a PermissionInfo. */
    class PermissionInfo {

        /**
         * Constructs a new PermissionInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PermissionInfo.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PermissionInfo permission. */
        permission: hbb.PermissionInfo.Permission;

        /** PermissionInfo enabled. */
        enabled: boolean;

        /**
         * Creates a new PermissionInfo instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PermissionInfo instance
         */
        static create(properties: hbb.PermissionInfo.$Shape): hbb.PermissionInfo & hbb.PermissionInfo.$Shape;
        static create(properties?: hbb.PermissionInfo.$Properties): hbb.PermissionInfo;

        /**
         * Encodes the specified PermissionInfo message. Does not implicitly {@link hbb.PermissionInfo.verify|verify} messages.
         * @param message PermissionInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PermissionInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PermissionInfo message, length delimited. Does not implicitly {@link hbb.PermissionInfo.verify|verify} messages.
         * @param message PermissionInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PermissionInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PermissionInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PermissionInfo & hbb.PermissionInfo.$Shape} PermissionInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PermissionInfo & hbb.PermissionInfo.$Shape;

        /**
         * Decodes a PermissionInfo message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PermissionInfo & hbb.PermissionInfo.$Shape} PermissionInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PermissionInfo & hbb.PermissionInfo.$Shape;

        /**
         * Verifies a PermissionInfo message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PermissionInfo message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PermissionInfo
         */
        static fromObject(object: { [k: string]: any }): hbb.PermissionInfo;

        /**
         * Creates a plain object from a PermissionInfo message. Also converts values to other types if specified.
         * @param message PermissionInfo
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PermissionInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PermissionInfo to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PermissionInfo
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PermissionInfo {

        /** Properties of a PermissionInfo. */
        interface $Properties {

            /** PermissionInfo permission */
            permission?: (hbb.PermissionInfo.Permission|null);

            /** PermissionInfo enabled */
            enabled?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PermissionInfo. */
        type $Shape = hbb.PermissionInfo.$Properties;

        /** Permission enum. */
        enum Permission {

            /** Keyboard value */
            Keyboard = 0,

            /** Clipboard value */
            Clipboard = 2,

            /** Audio value */
            Audio = 3,

            /** File value */
            File = 4,

            /** Restart value */
            Restart = 5,

            /** Recording value */
            Recording = 6,

            /** BlockInput value */
            BlockInput = 7
        }
    }

    /** ImageQuality enum. */
    enum ImageQuality {

        /** NotSet value */
        NotSet = 0,

        /** Low value */
        Low = 2,

        /** Balanced value */
        Balanced = 3,

        /** Best value */
        Best = 4
    }

    /**
     * Properties of a SupportedDecoding.
     * @deprecated Use hbb.SupportedDecoding.$Properties instead.
     */
    interface ISupportedDecoding extends hbb.SupportedDecoding.$Properties {
    }

    /** Represents a SupportedDecoding. */
    class SupportedDecoding {

        /**
         * Constructs a new SupportedDecoding.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SupportedDecoding.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SupportedDecoding abilityVp9. */
        abilityVp9: number;

        /** SupportedDecoding abilityH264. */
        abilityH264: number;

        /** SupportedDecoding abilityH265. */
        abilityH265: number;

        /** SupportedDecoding prefer. */
        prefer: hbb.SupportedDecoding.PreferCodec;

        /** SupportedDecoding abilityVp8. */
        abilityVp8: number;

        /** SupportedDecoding abilityAv1. */
        abilityAv1: number;

        /** SupportedDecoding i444. */
        i444?: (hbb.CodecAbility.$Properties|null);

        /** SupportedDecoding preferChroma. */
        preferChroma: hbb.Chroma;

        /**
         * Creates a new SupportedDecoding instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SupportedDecoding instance
         */
        static create(properties: hbb.SupportedDecoding.$Shape): hbb.SupportedDecoding & hbb.SupportedDecoding.$Shape;
        static create(properties?: hbb.SupportedDecoding.$Properties): hbb.SupportedDecoding;

        /**
         * Encodes the specified SupportedDecoding message. Does not implicitly {@link hbb.SupportedDecoding.verify|verify} messages.
         * @param message SupportedDecoding message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SupportedDecoding.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SupportedDecoding message, length delimited. Does not implicitly {@link hbb.SupportedDecoding.verify|verify} messages.
         * @param message SupportedDecoding message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SupportedDecoding.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SupportedDecoding message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SupportedDecoding & hbb.SupportedDecoding.$Shape} SupportedDecoding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SupportedDecoding & hbb.SupportedDecoding.$Shape;

        /**
         * Decodes a SupportedDecoding message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SupportedDecoding & hbb.SupportedDecoding.$Shape} SupportedDecoding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SupportedDecoding & hbb.SupportedDecoding.$Shape;

        /**
         * Verifies a SupportedDecoding message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SupportedDecoding message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SupportedDecoding
         */
        static fromObject(object: { [k: string]: any }): hbb.SupportedDecoding;

        /**
         * Creates a plain object from a SupportedDecoding message. Also converts values to other types if specified.
         * @param message SupportedDecoding
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SupportedDecoding, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SupportedDecoding to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SupportedDecoding
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SupportedDecoding {

        /** Properties of a SupportedDecoding. */
        interface $Properties {

            /** SupportedDecoding abilityVp9 */
            abilityVp9?: (number|null);

            /** SupportedDecoding abilityH264 */
            abilityH264?: (number|null);

            /** SupportedDecoding abilityH265 */
            abilityH265?: (number|null);

            /** SupportedDecoding prefer */
            prefer?: (hbb.SupportedDecoding.PreferCodec|null);

            /** SupportedDecoding abilityVp8 */
            abilityVp8?: (number|null);

            /** SupportedDecoding abilityAv1 */
            abilityAv1?: (number|null);

            /** SupportedDecoding i444 */
            i444?: (hbb.CodecAbility.$Properties|null);

            /** SupportedDecoding preferChroma */
            preferChroma?: (hbb.Chroma|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SupportedDecoding. */
        type $Shape = hbb.SupportedDecoding.$Properties;

        /** PreferCodec enum. */
        enum PreferCodec {

            /** Auto value */
            Auto = 0,

            /** VP9 value */
            VP9 = 1,

            /** H264 value */
            H264 = 2,

            /** H265 value */
            H265 = 3,

            /** VP8 value */
            VP8 = 4,

            /** AV1 value */
            AV1 = 5
        }
    }

    /**
     * Properties of an OptionMessage.
     * @deprecated Use hbb.OptionMessage.$Properties instead.
     */
    interface IOptionMessage extends hbb.OptionMessage.$Properties {
    }

    /** Represents an OptionMessage. */
    class OptionMessage {

        /**
         * Constructs a new OptionMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.OptionMessage.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** OptionMessage imageQuality. */
        imageQuality: hbb.ImageQuality;

        /** OptionMessage lockAfterSessionEnd. */
        lockAfterSessionEnd: hbb.OptionMessage.BoolOption;

        /** OptionMessage showRemoteCursor. */
        showRemoteCursor: hbb.OptionMessage.BoolOption;

        /** OptionMessage privacyMode. */
        privacyMode: hbb.OptionMessage.BoolOption;

        /** OptionMessage blockInput. */
        blockInput: hbb.OptionMessage.BoolOption;

        /** OptionMessage customImageQuality. */
        customImageQuality: number;

        /** OptionMessage disableAudio. */
        disableAudio: hbb.OptionMessage.BoolOption;

        /** OptionMessage disableClipboard. */
        disableClipboard: hbb.OptionMessage.BoolOption;

        /** OptionMessage enableFileTransfer. */
        enableFileTransfer: hbb.OptionMessage.BoolOption;

        /** OptionMessage supportedDecoding. */
        supportedDecoding?: (hbb.SupportedDecoding.$Properties|null);

        /** OptionMessage customFps. */
        customFps: number;

        /** OptionMessage disableKeyboard. */
        disableKeyboard: hbb.OptionMessage.BoolOption;

        /** OptionMessage followRemoteCursor. */
        followRemoteCursor: hbb.OptionMessage.BoolOption;

        /** OptionMessage followRemoteWindow. */
        followRemoteWindow: hbb.OptionMessage.BoolOption;

        /** OptionMessage disableCamera. */
        disableCamera: hbb.OptionMessage.BoolOption;

        /** OptionMessage terminalPersistent. */
        terminalPersistent: hbb.OptionMessage.BoolOption;

        /** OptionMessage showMyCursor. */
        showMyCursor: hbb.OptionMessage.BoolOption;

        /**
         * Creates a new OptionMessage instance using the specified properties.
         * @param [properties] Properties to set
         * @returns OptionMessage instance
         */
        static create(properties: hbb.OptionMessage.$Shape): hbb.OptionMessage & hbb.OptionMessage.$Shape;
        static create(properties?: hbb.OptionMessage.$Properties): hbb.OptionMessage;

        /**
         * Encodes the specified OptionMessage message. Does not implicitly {@link hbb.OptionMessage.verify|verify} messages.
         * @param message OptionMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.OptionMessage.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified OptionMessage message, length delimited. Does not implicitly {@link hbb.OptionMessage.verify|verify} messages.
         * @param message OptionMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.OptionMessage.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an OptionMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.OptionMessage & hbb.OptionMessage.$Shape} OptionMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.OptionMessage & hbb.OptionMessage.$Shape;

        /**
         * Decodes an OptionMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.OptionMessage & hbb.OptionMessage.$Shape} OptionMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.OptionMessage & hbb.OptionMessage.$Shape;

        /**
         * Verifies an OptionMessage message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an OptionMessage message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns OptionMessage
         */
        static fromObject(object: { [k: string]: any }): hbb.OptionMessage;

        /**
         * Creates a plain object from an OptionMessage message. Also converts values to other types if specified.
         * @param message OptionMessage
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.OptionMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this OptionMessage to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for OptionMessage
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace OptionMessage {

        /** Properties of an OptionMessage. */
        interface $Properties {

            /** OptionMessage imageQuality */
            imageQuality?: (hbb.ImageQuality|null);

            /** OptionMessage lockAfterSessionEnd */
            lockAfterSessionEnd?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage showRemoteCursor */
            showRemoteCursor?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage privacyMode */
            privacyMode?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage blockInput */
            blockInput?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage customImageQuality */
            customImageQuality?: (number|null);

            /** OptionMessage disableAudio */
            disableAudio?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage disableClipboard */
            disableClipboard?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage enableFileTransfer */
            enableFileTransfer?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage supportedDecoding */
            supportedDecoding?: (hbb.SupportedDecoding.$Properties|null);

            /** OptionMessage customFps */
            customFps?: (number|null);

            /** OptionMessage disableKeyboard */
            disableKeyboard?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage followRemoteCursor */
            followRemoteCursor?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage followRemoteWindow */
            followRemoteWindow?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage disableCamera */
            disableCamera?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage terminalPersistent */
            terminalPersistent?: (hbb.OptionMessage.BoolOption|null);

            /** OptionMessage showMyCursor */
            showMyCursor?: (hbb.OptionMessage.BoolOption|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an OptionMessage. */
        type $Shape = hbb.OptionMessage.$Properties;

        /** BoolOption enum. */
        enum BoolOption {

            /** NotSet value */
            NotSet = 0,

            /** No value */
            No = 1,

            /** Yes value */
            Yes = 2
        }
    }

    /**
     * Properties of a TestDelay.
     * @deprecated Use hbb.TestDelay.$Properties instead.
     */
    interface ITestDelay extends hbb.TestDelay.$Properties {
    }

    /** Represents a TestDelay. */
    class TestDelay {

        /**
         * Constructs a new TestDelay.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TestDelay.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TestDelay time. */
        time: (number|Long);

        /** TestDelay fromClient. */
        fromClient: boolean;

        /** TestDelay lastDelay. */
        lastDelay: number;

        /** TestDelay targetBitrate. */
        targetBitrate: number;

        /**
         * Creates a new TestDelay instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TestDelay instance
         */
        static create(properties: hbb.TestDelay.$Shape): hbb.TestDelay & hbb.TestDelay.$Shape;
        static create(properties?: hbb.TestDelay.$Properties): hbb.TestDelay;

        /**
         * Encodes the specified TestDelay message. Does not implicitly {@link hbb.TestDelay.verify|verify} messages.
         * @param message TestDelay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TestDelay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TestDelay message, length delimited. Does not implicitly {@link hbb.TestDelay.verify|verify} messages.
         * @param message TestDelay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TestDelay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TestDelay message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TestDelay & hbb.TestDelay.$Shape} TestDelay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TestDelay & hbb.TestDelay.$Shape;

        /**
         * Decodes a TestDelay message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TestDelay & hbb.TestDelay.$Shape} TestDelay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TestDelay & hbb.TestDelay.$Shape;

        /**
         * Verifies a TestDelay message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TestDelay message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TestDelay
         */
        static fromObject(object: { [k: string]: any }): hbb.TestDelay;

        /**
         * Creates a plain object from a TestDelay message. Also converts values to other types if specified.
         * @param message TestDelay
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TestDelay, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TestDelay to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TestDelay
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TestDelay {

        /** Properties of a TestDelay. */
        interface $Properties {

            /** TestDelay time */
            time?: (number|Long|null);

            /** TestDelay fromClient */
            fromClient?: (boolean|null);

            /** TestDelay lastDelay */
            lastDelay?: (number|null);

            /** TestDelay targetBitrate */
            targetBitrate?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TestDelay. */
        type $Shape = hbb.TestDelay.$Properties;
    }

    /**
     * Properties of a PublicKey.
     * @deprecated Use hbb.PublicKey.$Properties instead.
     */
    interface IPublicKey extends hbb.PublicKey.$Properties {
    }

    /** Represents a PublicKey. */
    class PublicKey {

        /**
         * Constructs a new PublicKey.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PublicKey.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PublicKey asymmetricValue. */
        asymmetricValue: Uint8Array;

        /** PublicKey symmetricValue. */
        symmetricValue: Uint8Array;

        /**
         * Creates a new PublicKey instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PublicKey instance
         */
        static create(properties: hbb.PublicKey.$Shape): hbb.PublicKey & hbb.PublicKey.$Shape;
        static create(properties?: hbb.PublicKey.$Properties): hbb.PublicKey;

        /**
         * Encodes the specified PublicKey message. Does not implicitly {@link hbb.PublicKey.verify|verify} messages.
         * @param message PublicKey message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PublicKey.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PublicKey message, length delimited. Does not implicitly {@link hbb.PublicKey.verify|verify} messages.
         * @param message PublicKey message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PublicKey.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PublicKey message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PublicKey & hbb.PublicKey.$Shape} PublicKey
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PublicKey & hbb.PublicKey.$Shape;

        /**
         * Decodes a PublicKey message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PublicKey & hbb.PublicKey.$Shape} PublicKey
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PublicKey & hbb.PublicKey.$Shape;

        /**
         * Verifies a PublicKey message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PublicKey message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PublicKey
         */
        static fromObject(object: { [k: string]: any }): hbb.PublicKey;

        /**
         * Creates a plain object from a PublicKey message. Also converts values to other types if specified.
         * @param message PublicKey
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PublicKey, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PublicKey to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PublicKey
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PublicKey {

        /** Properties of a PublicKey. */
        interface $Properties {

            /** PublicKey asymmetricValue */
            asymmetricValue?: (Uint8Array|null);

            /** PublicKey symmetricValue */
            symmetricValue?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PublicKey. */
        type $Shape = hbb.PublicKey.$Properties;
    }

    /**
     * Properties of a SignedId.
     * @deprecated Use hbb.SignedId.$Properties instead.
     */
    interface ISignedId extends hbb.SignedId.$Properties {
    }

    /** Represents a SignedId. */
    class SignedId {

        /**
         * Constructs a new SignedId.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SignedId.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SignedId id. */
        id: Uint8Array;

        /**
         * Creates a new SignedId instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SignedId instance
         */
        static create(properties: hbb.SignedId.$Shape): hbb.SignedId & hbb.SignedId.$Shape;
        static create(properties?: hbb.SignedId.$Properties): hbb.SignedId;

        /**
         * Encodes the specified SignedId message. Does not implicitly {@link hbb.SignedId.verify|verify} messages.
         * @param message SignedId message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SignedId.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SignedId message, length delimited. Does not implicitly {@link hbb.SignedId.verify|verify} messages.
         * @param message SignedId message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SignedId.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SignedId message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SignedId & hbb.SignedId.$Shape} SignedId
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SignedId & hbb.SignedId.$Shape;

        /**
         * Decodes a SignedId message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SignedId & hbb.SignedId.$Shape} SignedId
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SignedId & hbb.SignedId.$Shape;

        /**
         * Verifies a SignedId message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SignedId message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SignedId
         */
        static fromObject(object: { [k: string]: any }): hbb.SignedId;

        /**
         * Creates a plain object from a SignedId message. Also converts values to other types if specified.
         * @param message SignedId
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SignedId, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SignedId to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SignedId
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SignedId {

        /** Properties of a SignedId. */
        interface $Properties {

            /** SignedId id */
            id?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SignedId. */
        type $Shape = hbb.SignedId.$Properties;
    }

    /**
     * Properties of an AudioFormat.
     * @deprecated Use hbb.AudioFormat.$Properties instead.
     */
    interface IAudioFormat extends hbb.AudioFormat.$Properties {
    }

    /** Represents an AudioFormat. */
    class AudioFormat {

        /**
         * Constructs a new AudioFormat.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.AudioFormat.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** AudioFormat sampleRate. */
        sampleRate: number;

        /** AudioFormat channels. */
        channels: number;

        /**
         * Creates a new AudioFormat instance using the specified properties.
         * @param [properties] Properties to set
         * @returns AudioFormat instance
         */
        static create(properties: hbb.AudioFormat.$Shape): hbb.AudioFormat & hbb.AudioFormat.$Shape;
        static create(properties?: hbb.AudioFormat.$Properties): hbb.AudioFormat;

        /**
         * Encodes the specified AudioFormat message. Does not implicitly {@link hbb.AudioFormat.verify|verify} messages.
         * @param message AudioFormat message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.AudioFormat.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified AudioFormat message, length delimited. Does not implicitly {@link hbb.AudioFormat.verify|verify} messages.
         * @param message AudioFormat message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.AudioFormat.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an AudioFormat message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.AudioFormat & hbb.AudioFormat.$Shape} AudioFormat
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.AudioFormat & hbb.AudioFormat.$Shape;

        /**
         * Decodes an AudioFormat message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.AudioFormat & hbb.AudioFormat.$Shape} AudioFormat
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.AudioFormat & hbb.AudioFormat.$Shape;

        /**
         * Verifies an AudioFormat message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an AudioFormat message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns AudioFormat
         */
        static fromObject(object: { [k: string]: any }): hbb.AudioFormat;

        /**
         * Creates a plain object from an AudioFormat message. Also converts values to other types if specified.
         * @param message AudioFormat
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.AudioFormat, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this AudioFormat to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for AudioFormat
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace AudioFormat {

        /** Properties of an AudioFormat. */
        interface $Properties {

            /** AudioFormat sampleRate */
            sampleRate?: (number|null);

            /** AudioFormat channels */
            channels?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an AudioFormat. */
        type $Shape = hbb.AudioFormat.$Properties;
    }

    /**
     * Properties of an AudioFrame.
     * @deprecated Use hbb.AudioFrame.$Properties instead.
     */
    interface IAudioFrame extends hbb.AudioFrame.$Properties {
    }

    /** Represents an AudioFrame. */
    class AudioFrame {

        /**
         * Constructs a new AudioFrame.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.AudioFrame.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** AudioFrame data. */
        data: Uint8Array;

        /**
         * Creates a new AudioFrame instance using the specified properties.
         * @param [properties] Properties to set
         * @returns AudioFrame instance
         */
        static create(properties: hbb.AudioFrame.$Shape): hbb.AudioFrame & hbb.AudioFrame.$Shape;
        static create(properties?: hbb.AudioFrame.$Properties): hbb.AudioFrame;

        /**
         * Encodes the specified AudioFrame message. Does not implicitly {@link hbb.AudioFrame.verify|verify} messages.
         * @param message AudioFrame message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.AudioFrame.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified AudioFrame message, length delimited. Does not implicitly {@link hbb.AudioFrame.verify|verify} messages.
         * @param message AudioFrame message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.AudioFrame.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an AudioFrame message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.AudioFrame & hbb.AudioFrame.$Shape} AudioFrame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.AudioFrame & hbb.AudioFrame.$Shape;

        /**
         * Decodes an AudioFrame message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.AudioFrame & hbb.AudioFrame.$Shape} AudioFrame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.AudioFrame & hbb.AudioFrame.$Shape;

        /**
         * Verifies an AudioFrame message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an AudioFrame message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns AudioFrame
         */
        static fromObject(object: { [k: string]: any }): hbb.AudioFrame;

        /**
         * Creates a plain object from an AudioFrame message. Also converts values to other types if specified.
         * @param message AudioFrame
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.AudioFrame, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this AudioFrame to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for AudioFrame
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace AudioFrame {

        /** Properties of an AudioFrame. */
        interface $Properties {

            /** AudioFrame data */
            data?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an AudioFrame. */
        type $Shape = hbb.AudioFrame.$Properties;
    }

    /**
     * Properties of a MessageBox.
     * @deprecated Use hbb.MessageBox.$Properties instead.
     */
    interface IMessageBox extends hbb.MessageBox.$Properties {
    }

    /** Represents a MessageBox. */
    class MessageBox {

        /**
         * Constructs a new MessageBox.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.MessageBox.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** MessageBox msgtype. */
        msgtype: string;

        /** MessageBox title. */
        title: string;

        /** MessageBox text. */
        text: string;

        /** MessageBox link. */
        link: string;

        /**
         * Creates a new MessageBox instance using the specified properties.
         * @param [properties] Properties to set
         * @returns MessageBox instance
         */
        static create(properties: hbb.MessageBox.$Shape): hbb.MessageBox & hbb.MessageBox.$Shape;
        static create(properties?: hbb.MessageBox.$Properties): hbb.MessageBox;

        /**
         * Encodes the specified MessageBox message. Does not implicitly {@link hbb.MessageBox.verify|verify} messages.
         * @param message MessageBox message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.MessageBox.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified MessageBox message, length delimited. Does not implicitly {@link hbb.MessageBox.verify|verify} messages.
         * @param message MessageBox message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.MessageBox.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MessageBox message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.MessageBox & hbb.MessageBox.$Shape} MessageBox
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.MessageBox & hbb.MessageBox.$Shape;

        /**
         * Decodes a MessageBox message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.MessageBox & hbb.MessageBox.$Shape} MessageBox
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.MessageBox & hbb.MessageBox.$Shape;

        /**
         * Verifies a MessageBox message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a MessageBox message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns MessageBox
         */
        static fromObject(object: { [k: string]: any }): hbb.MessageBox;

        /**
         * Creates a plain object from a MessageBox message. Also converts values to other types if specified.
         * @param message MessageBox
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.MessageBox, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this MessageBox to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for MessageBox
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace MessageBox {

        /** Properties of a MessageBox. */
        interface $Properties {

            /** MessageBox msgtype */
            msgtype?: (string|null);

            /** MessageBox title */
            title?: (string|null);

            /** MessageBox text */
            text?: (string|null);

            /** MessageBox link */
            link?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a MessageBox. */
        type $Shape = hbb.MessageBox.$Properties;
    }

    /**
     * Properties of a BackNotification.
     * @deprecated Use hbb.BackNotification.$Properties instead.
     */
    interface IBackNotification extends hbb.BackNotification.$Properties {
    }

    /** Represents a BackNotification. */
    class BackNotification {

        /**
         * Constructs a new BackNotification.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.BackNotification.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** BackNotification privacyModeState. */
        privacyModeState?: (hbb.BackNotification.PrivacyModeState|null);

        /** BackNotification blockInputState. */
        blockInputState?: (hbb.BackNotification.BlockInputState|null);

        /** BackNotification details. */
        details: string;

        /** BackNotification implKey. */
        implKey: string;

        /** BackNotification union. */
        union?: ("privacyModeState"|"blockInputState");

        /**
         * Creates a new BackNotification instance using the specified properties.
         * @param [properties] Properties to set
         * @returns BackNotification instance
         */
        static create(properties: hbb.BackNotification.$Shape): hbb.BackNotification & hbb.BackNotification.$Shape;
        static create(properties?: hbb.BackNotification.$Properties): hbb.BackNotification;

        /**
         * Encodes the specified BackNotification message. Does not implicitly {@link hbb.BackNotification.verify|verify} messages.
         * @param message BackNotification message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.BackNotification.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified BackNotification message, length delimited. Does not implicitly {@link hbb.BackNotification.verify|verify} messages.
         * @param message BackNotification message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.BackNotification.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a BackNotification message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.BackNotification & hbb.BackNotification.$Shape} BackNotification
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.BackNotification & hbb.BackNotification.$Shape;

        /**
         * Decodes a BackNotification message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.BackNotification & hbb.BackNotification.$Shape} BackNotification
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.BackNotification & hbb.BackNotification.$Shape;

        /**
         * Verifies a BackNotification message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a BackNotification message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns BackNotification
         */
        static fromObject(object: { [k: string]: any }): hbb.BackNotification;

        /**
         * Creates a plain object from a BackNotification message. Also converts values to other types if specified.
         * @param message BackNotification
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.BackNotification, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this BackNotification to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for BackNotification
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace BackNotification {

        /** Properties of a BackNotification. */
        interface $Properties {

            /** BackNotification privacyModeState */
            privacyModeState?: (hbb.BackNotification.PrivacyModeState|null);

            /** BackNotification blockInputState */
            blockInputState?: (hbb.BackNotification.BlockInputState|null);

            /** BackNotification details */
            details?: (string|null);

            /** BackNotification implKey */
            implKey?: (string|null);

            /** BackNotification union */
            union?: ("privacyModeState"|"blockInputState");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a BackNotification. */
        type $Shape = {
          privacyModeState?: hbb.BackNotification.PrivacyModeState|null;
          blockInputState?: hbb.BackNotification.BlockInputState|null;
          details?: string|null;
          implKey?: string|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; privacyModeState?: null; blockInputState?: null }|{ union?: "privacyModeState"; privacyModeState: hbb.BackNotification.PrivacyModeState; blockInputState?: null }|{ union?: "blockInputState"; privacyModeState?: null; blockInputState: hbb.BackNotification.BlockInputState })
        );

        /** BlockInputState enum. */
        enum BlockInputState {

            /** BlkStateUnknown value */
            BlkStateUnknown = 0,

            /** BlkOnSucceeded value */
            BlkOnSucceeded = 2,

            /** BlkOnFailed value */
            BlkOnFailed = 3,

            /** BlkOffSucceeded value */
            BlkOffSucceeded = 4,

            /** BlkOffFailed value */
            BlkOffFailed = 5
        }

        /** PrivacyModeState enum. */
        enum PrivacyModeState {

            /** PrvStateUnknown value */
            PrvStateUnknown = 0,

            /** PrvOnByOther value */
            PrvOnByOther = 2,

            /** PrvNotSupported value */
            PrvNotSupported = 3,

            /** PrvOnSucceeded value */
            PrvOnSucceeded = 4,

            /** PrvOnFailedDenied value */
            PrvOnFailedDenied = 5,

            /** PrvOnFailedPlugin value */
            PrvOnFailedPlugin = 6,

            /** PrvOnFailed value */
            PrvOnFailed = 7,

            /** PrvOffSucceeded value */
            PrvOffSucceeded = 8,

            /** PrvOffByPeer value */
            PrvOffByPeer = 9,

            /** PrvOffFailed value */
            PrvOffFailed = 10,

            /** PrvOffUnknown value */
            PrvOffUnknown = 11
        }
    }

    /**
     * Properties of an ElevationRequestWithLogon.
     * @deprecated Use hbb.ElevationRequestWithLogon.$Properties instead.
     */
    interface IElevationRequestWithLogon extends hbb.ElevationRequestWithLogon.$Properties {
    }

    /** Represents an ElevationRequestWithLogon. */
    class ElevationRequestWithLogon {

        /**
         * Constructs a new ElevationRequestWithLogon.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ElevationRequestWithLogon.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ElevationRequestWithLogon username. */
        username: string;

        /** ElevationRequestWithLogon password. */
        password: string;

        /**
         * Creates a new ElevationRequestWithLogon instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ElevationRequestWithLogon instance
         */
        static create(properties: hbb.ElevationRequestWithLogon.$Shape): hbb.ElevationRequestWithLogon & hbb.ElevationRequestWithLogon.$Shape;
        static create(properties?: hbb.ElevationRequestWithLogon.$Properties): hbb.ElevationRequestWithLogon;

        /**
         * Encodes the specified ElevationRequestWithLogon message. Does not implicitly {@link hbb.ElevationRequestWithLogon.verify|verify} messages.
         * @param message ElevationRequestWithLogon message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ElevationRequestWithLogon.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ElevationRequestWithLogon message, length delimited. Does not implicitly {@link hbb.ElevationRequestWithLogon.verify|verify} messages.
         * @param message ElevationRequestWithLogon message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ElevationRequestWithLogon.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an ElevationRequestWithLogon message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ElevationRequestWithLogon & hbb.ElevationRequestWithLogon.$Shape} ElevationRequestWithLogon
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ElevationRequestWithLogon & hbb.ElevationRequestWithLogon.$Shape;

        /**
         * Decodes an ElevationRequestWithLogon message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ElevationRequestWithLogon & hbb.ElevationRequestWithLogon.$Shape} ElevationRequestWithLogon
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ElevationRequestWithLogon & hbb.ElevationRequestWithLogon.$Shape;

        /**
         * Verifies an ElevationRequestWithLogon message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an ElevationRequestWithLogon message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ElevationRequestWithLogon
         */
        static fromObject(object: { [k: string]: any }): hbb.ElevationRequestWithLogon;

        /**
         * Creates a plain object from an ElevationRequestWithLogon message. Also converts values to other types if specified.
         * @param message ElevationRequestWithLogon
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ElevationRequestWithLogon, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ElevationRequestWithLogon to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ElevationRequestWithLogon
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ElevationRequestWithLogon {

        /** Properties of an ElevationRequestWithLogon. */
        interface $Properties {

            /** ElevationRequestWithLogon username */
            username?: (string|null);

            /** ElevationRequestWithLogon password */
            password?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an ElevationRequestWithLogon. */
        type $Shape = hbb.ElevationRequestWithLogon.$Properties;
    }

    /**
     * Properties of an ElevationRequest.
     * @deprecated Use hbb.ElevationRequest.$Properties instead.
     */
    interface IElevationRequest extends hbb.ElevationRequest.$Properties {
    }

    /** Represents an ElevationRequest. */
    class ElevationRequest {

        /**
         * Constructs a new ElevationRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ElevationRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ElevationRequest direct. */
        direct?: (boolean|null);

        /** ElevationRequest logon. */
        logon?: (hbb.ElevationRequestWithLogon.$Properties|null);

        /** ElevationRequest union. */
        union?: ("direct"|"logon");

        /**
         * Creates a new ElevationRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ElevationRequest instance
         */
        static create(properties: hbb.ElevationRequest.$Shape): hbb.ElevationRequest & hbb.ElevationRequest.$Shape;
        static create(properties?: hbb.ElevationRequest.$Properties): hbb.ElevationRequest;

        /**
         * Encodes the specified ElevationRequest message. Does not implicitly {@link hbb.ElevationRequest.verify|verify} messages.
         * @param message ElevationRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ElevationRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ElevationRequest message, length delimited. Does not implicitly {@link hbb.ElevationRequest.verify|verify} messages.
         * @param message ElevationRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ElevationRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an ElevationRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ElevationRequest & hbb.ElevationRequest.$Shape} ElevationRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ElevationRequest & hbb.ElevationRequest.$Shape;

        /**
         * Decodes an ElevationRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ElevationRequest & hbb.ElevationRequest.$Shape} ElevationRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ElevationRequest & hbb.ElevationRequest.$Shape;

        /**
         * Verifies an ElevationRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an ElevationRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ElevationRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.ElevationRequest;

        /**
         * Creates a plain object from an ElevationRequest message. Also converts values to other types if specified.
         * @param message ElevationRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ElevationRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ElevationRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ElevationRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ElevationRequest {

        /** Properties of an ElevationRequest. */
        interface $Properties {

            /** ElevationRequest direct */
            direct?: (boolean|null);

            /** ElevationRequest logon */
            logon?: (hbb.ElevationRequestWithLogon.$Properties|null);

            /** ElevationRequest union */
            union?: ("direct"|"logon");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of an ElevationRequest. */
        type $Shape = {
          direct?: boolean|null;
          logon?: hbb.ElevationRequestWithLogon.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; direct?: null; logon?: null }|{ union?: "direct"; direct: boolean; logon?: null }|{ union?: "logon"; direct?: null; logon: hbb.ElevationRequestWithLogon.$Shape })
        );
    }

    /**
     * Properties of a SwitchSidesRequest.
     * @deprecated Use hbb.SwitchSidesRequest.$Properties instead.
     */
    interface ISwitchSidesRequest extends hbb.SwitchSidesRequest.$Properties {
    }

    /** Represents a SwitchSidesRequest. */
    class SwitchSidesRequest {

        /**
         * Constructs a new SwitchSidesRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SwitchSidesRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SwitchSidesRequest uuid. */
        uuid: Uint8Array;

        /**
         * Creates a new SwitchSidesRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SwitchSidesRequest instance
         */
        static create(properties: hbb.SwitchSidesRequest.$Shape): hbb.SwitchSidesRequest & hbb.SwitchSidesRequest.$Shape;
        static create(properties?: hbb.SwitchSidesRequest.$Properties): hbb.SwitchSidesRequest;

        /**
         * Encodes the specified SwitchSidesRequest message. Does not implicitly {@link hbb.SwitchSidesRequest.verify|verify} messages.
         * @param message SwitchSidesRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SwitchSidesRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SwitchSidesRequest message, length delimited. Does not implicitly {@link hbb.SwitchSidesRequest.verify|verify} messages.
         * @param message SwitchSidesRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SwitchSidesRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SwitchSidesRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SwitchSidesRequest & hbb.SwitchSidesRequest.$Shape} SwitchSidesRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SwitchSidesRequest & hbb.SwitchSidesRequest.$Shape;

        /**
         * Decodes a SwitchSidesRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SwitchSidesRequest & hbb.SwitchSidesRequest.$Shape} SwitchSidesRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SwitchSidesRequest & hbb.SwitchSidesRequest.$Shape;

        /**
         * Verifies a SwitchSidesRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SwitchSidesRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SwitchSidesRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.SwitchSidesRequest;

        /**
         * Creates a plain object from a SwitchSidesRequest message. Also converts values to other types if specified.
         * @param message SwitchSidesRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SwitchSidesRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SwitchSidesRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SwitchSidesRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SwitchSidesRequest {

        /** Properties of a SwitchSidesRequest. */
        interface $Properties {

            /** SwitchSidesRequest uuid */
            uuid?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SwitchSidesRequest. */
        type $Shape = hbb.SwitchSidesRequest.$Properties;
    }

    /**
     * Properties of a SwitchSidesResponse.
     * @deprecated Use hbb.SwitchSidesResponse.$Properties instead.
     */
    interface ISwitchSidesResponse extends hbb.SwitchSidesResponse.$Properties {
    }

    /** Represents a SwitchSidesResponse. */
    class SwitchSidesResponse {

        /**
         * Constructs a new SwitchSidesResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SwitchSidesResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SwitchSidesResponse uuid. */
        uuid: Uint8Array;

        /** SwitchSidesResponse lr. */
        lr?: (hbb.LoginRequest.$Properties|null);

        /**
         * Creates a new SwitchSidesResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SwitchSidesResponse instance
         */
        static create(properties: hbb.SwitchSidesResponse.$Shape): hbb.SwitchSidesResponse & hbb.SwitchSidesResponse.$Shape;
        static create(properties?: hbb.SwitchSidesResponse.$Properties): hbb.SwitchSidesResponse;

        /**
         * Encodes the specified SwitchSidesResponse message. Does not implicitly {@link hbb.SwitchSidesResponse.verify|verify} messages.
         * @param message SwitchSidesResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SwitchSidesResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SwitchSidesResponse message, length delimited. Does not implicitly {@link hbb.SwitchSidesResponse.verify|verify} messages.
         * @param message SwitchSidesResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SwitchSidesResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SwitchSidesResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SwitchSidesResponse & hbb.SwitchSidesResponse.$Shape} SwitchSidesResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SwitchSidesResponse & hbb.SwitchSidesResponse.$Shape;

        /**
         * Decodes a SwitchSidesResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SwitchSidesResponse & hbb.SwitchSidesResponse.$Shape} SwitchSidesResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SwitchSidesResponse & hbb.SwitchSidesResponse.$Shape;

        /**
         * Verifies a SwitchSidesResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SwitchSidesResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SwitchSidesResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.SwitchSidesResponse;

        /**
         * Creates a plain object from a SwitchSidesResponse message. Also converts values to other types if specified.
         * @param message SwitchSidesResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SwitchSidesResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SwitchSidesResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SwitchSidesResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SwitchSidesResponse {

        /** Properties of a SwitchSidesResponse. */
        interface $Properties {

            /** SwitchSidesResponse uuid */
            uuid?: (Uint8Array|null);

            /** SwitchSidesResponse lr */
            lr?: (hbb.LoginRequest.$Properties|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SwitchSidesResponse. */
        type $Shape = {
          uuid?: Uint8Array|null;
          lr?: hbb.LoginRequest.$Shape|null;
          $unknowns?: Uint8Array[];
        };
    }

    /**
     * Properties of a SwitchBack.
     * @deprecated Use hbb.SwitchBack.$Properties instead.
     */
    interface ISwitchBack extends hbb.SwitchBack.$Properties {
    }

    /** Represents a SwitchBack. */
    class SwitchBack {

        /**
         * Constructs a new SwitchBack.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SwitchBack.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /**
         * Creates a new SwitchBack instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SwitchBack instance
         */
        static create(properties: hbb.SwitchBack.$Shape): hbb.SwitchBack & hbb.SwitchBack.$Shape;
        static create(properties?: hbb.SwitchBack.$Properties): hbb.SwitchBack;

        /**
         * Encodes the specified SwitchBack message. Does not implicitly {@link hbb.SwitchBack.verify|verify} messages.
         * @param message SwitchBack message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SwitchBack.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SwitchBack message, length delimited. Does not implicitly {@link hbb.SwitchBack.verify|verify} messages.
         * @param message SwitchBack message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SwitchBack.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SwitchBack message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SwitchBack & hbb.SwitchBack.$Shape} SwitchBack
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SwitchBack & hbb.SwitchBack.$Shape;

        /**
         * Decodes a SwitchBack message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SwitchBack & hbb.SwitchBack.$Shape} SwitchBack
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SwitchBack & hbb.SwitchBack.$Shape;

        /**
         * Verifies a SwitchBack message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SwitchBack message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SwitchBack
         */
        static fromObject(object: { [k: string]: any }): hbb.SwitchBack;

        /**
         * Creates a plain object from a SwitchBack message. Also converts values to other types if specified.
         * @param message SwitchBack
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SwitchBack, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SwitchBack to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SwitchBack
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SwitchBack {

        /** Properties of a SwitchBack. */
        interface $Properties {

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SwitchBack. */
        type $Shape = hbb.SwitchBack.$Properties;
    }

    /**
     * Properties of a PluginRequest.
     * @deprecated Use hbb.PluginRequest.$Properties instead.
     */
    interface IPluginRequest extends hbb.PluginRequest.$Properties {
    }

    /** Represents a PluginRequest. */
    class PluginRequest {

        /**
         * Constructs a new PluginRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PluginRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PluginRequest id. */
        id: string;

        /** PluginRequest content. */
        content: Uint8Array;

        /**
         * Creates a new PluginRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PluginRequest instance
         */
        static create(properties: hbb.PluginRequest.$Shape): hbb.PluginRequest & hbb.PluginRequest.$Shape;
        static create(properties?: hbb.PluginRequest.$Properties): hbb.PluginRequest;

        /**
         * Encodes the specified PluginRequest message. Does not implicitly {@link hbb.PluginRequest.verify|verify} messages.
         * @param message PluginRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PluginRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PluginRequest message, length delimited. Does not implicitly {@link hbb.PluginRequest.verify|verify} messages.
         * @param message PluginRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PluginRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PluginRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PluginRequest & hbb.PluginRequest.$Shape} PluginRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PluginRequest & hbb.PluginRequest.$Shape;

        /**
         * Decodes a PluginRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PluginRequest & hbb.PluginRequest.$Shape} PluginRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PluginRequest & hbb.PluginRequest.$Shape;

        /**
         * Verifies a PluginRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PluginRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PluginRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.PluginRequest;

        /**
         * Creates a plain object from a PluginRequest message. Also converts values to other types if specified.
         * @param message PluginRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PluginRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PluginRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PluginRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PluginRequest {

        /** Properties of a PluginRequest. */
        interface $Properties {

            /** PluginRequest id */
            id?: (string|null);

            /** PluginRequest content */
            content?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PluginRequest. */
        type $Shape = hbb.PluginRequest.$Properties;
    }

    /**
     * Properties of a PluginFailure.
     * @deprecated Use hbb.PluginFailure.$Properties instead.
     */
    interface IPluginFailure extends hbb.PluginFailure.$Properties {
    }

    /** Represents a PluginFailure. */
    class PluginFailure {

        /**
         * Constructs a new PluginFailure.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PluginFailure.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PluginFailure id. */
        id: string;

        /** PluginFailure name. */
        name: string;

        /** PluginFailure msg. */
        msg: string;

        /**
         * Creates a new PluginFailure instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PluginFailure instance
         */
        static create(properties: hbb.PluginFailure.$Shape): hbb.PluginFailure & hbb.PluginFailure.$Shape;
        static create(properties?: hbb.PluginFailure.$Properties): hbb.PluginFailure;

        /**
         * Encodes the specified PluginFailure message. Does not implicitly {@link hbb.PluginFailure.verify|verify} messages.
         * @param message PluginFailure message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PluginFailure.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PluginFailure message, length delimited. Does not implicitly {@link hbb.PluginFailure.verify|verify} messages.
         * @param message PluginFailure message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PluginFailure.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PluginFailure message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PluginFailure & hbb.PluginFailure.$Shape} PluginFailure
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PluginFailure & hbb.PluginFailure.$Shape;

        /**
         * Decodes a PluginFailure message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PluginFailure & hbb.PluginFailure.$Shape} PluginFailure
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PluginFailure & hbb.PluginFailure.$Shape;

        /**
         * Verifies a PluginFailure message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PluginFailure message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PluginFailure
         */
        static fromObject(object: { [k: string]: any }): hbb.PluginFailure;

        /**
         * Creates a plain object from a PluginFailure message. Also converts values to other types if specified.
         * @param message PluginFailure
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PluginFailure, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PluginFailure to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PluginFailure
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PluginFailure {

        /** Properties of a PluginFailure. */
        interface $Properties {

            /** PluginFailure id */
            id?: (string|null);

            /** PluginFailure name */
            name?: (string|null);

            /** PluginFailure msg */
            msg?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PluginFailure. */
        type $Shape = hbb.PluginFailure.$Properties;
    }

    /**
     * Properties of a WindowsSessions.
     * @deprecated Use hbb.WindowsSessions.$Properties instead.
     */
    interface IWindowsSessions extends hbb.WindowsSessions.$Properties {
    }

    /** Represents a WindowsSessions. */
    class WindowsSessions {

        /**
         * Constructs a new WindowsSessions.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.WindowsSessions.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** WindowsSessions sessions. */
        sessions: hbb.WindowsSession.$Properties[];

        /** WindowsSessions currentSid. */
        currentSid: number;

        /**
         * Creates a new WindowsSessions instance using the specified properties.
         * @param [properties] Properties to set
         * @returns WindowsSessions instance
         */
        static create(properties: hbb.WindowsSessions.$Shape): hbb.WindowsSessions & hbb.WindowsSessions.$Shape;
        static create(properties?: hbb.WindowsSessions.$Properties): hbb.WindowsSessions;

        /**
         * Encodes the specified WindowsSessions message. Does not implicitly {@link hbb.WindowsSessions.verify|verify} messages.
         * @param message WindowsSessions message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.WindowsSessions.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified WindowsSessions message, length delimited. Does not implicitly {@link hbb.WindowsSessions.verify|verify} messages.
         * @param message WindowsSessions message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.WindowsSessions.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a WindowsSessions message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.WindowsSessions & hbb.WindowsSessions.$Shape} WindowsSessions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.WindowsSessions & hbb.WindowsSessions.$Shape;

        /**
         * Decodes a WindowsSessions message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.WindowsSessions & hbb.WindowsSessions.$Shape} WindowsSessions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.WindowsSessions & hbb.WindowsSessions.$Shape;

        /**
         * Verifies a WindowsSessions message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a WindowsSessions message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns WindowsSessions
         */
        static fromObject(object: { [k: string]: any }): hbb.WindowsSessions;

        /**
         * Creates a plain object from a WindowsSessions message. Also converts values to other types if specified.
         * @param message WindowsSessions
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.WindowsSessions, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this WindowsSessions to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for WindowsSessions
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace WindowsSessions {

        /** Properties of a WindowsSessions. */
        interface $Properties {

            /** WindowsSessions sessions */
            sessions?: (hbb.WindowsSession.$Properties[]|null);

            /** WindowsSessions currentSid */
            currentSid?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a WindowsSessions. */
        type $Shape = hbb.WindowsSessions.$Properties;
    }

    /**
     * Properties of a MessageQuery.
     * @deprecated Use hbb.MessageQuery.$Properties instead.
     */
    interface IMessageQuery extends hbb.MessageQuery.$Properties {
    }

    /** Represents a MessageQuery. */
    class MessageQuery {

        /**
         * Constructs a new MessageQuery.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.MessageQuery.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** MessageQuery switchDisplay. */
        switchDisplay: number;

        /**
         * Creates a new MessageQuery instance using the specified properties.
         * @param [properties] Properties to set
         * @returns MessageQuery instance
         */
        static create(properties: hbb.MessageQuery.$Shape): hbb.MessageQuery & hbb.MessageQuery.$Shape;
        static create(properties?: hbb.MessageQuery.$Properties): hbb.MessageQuery;

        /**
         * Encodes the specified MessageQuery message. Does not implicitly {@link hbb.MessageQuery.verify|verify} messages.
         * @param message MessageQuery message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.MessageQuery.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified MessageQuery message, length delimited. Does not implicitly {@link hbb.MessageQuery.verify|verify} messages.
         * @param message MessageQuery message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.MessageQuery.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MessageQuery message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.MessageQuery & hbb.MessageQuery.$Shape} MessageQuery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.MessageQuery & hbb.MessageQuery.$Shape;

        /**
         * Decodes a MessageQuery message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.MessageQuery & hbb.MessageQuery.$Shape} MessageQuery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.MessageQuery & hbb.MessageQuery.$Shape;

        /**
         * Verifies a MessageQuery message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a MessageQuery message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns MessageQuery
         */
        static fromObject(object: { [k: string]: any }): hbb.MessageQuery;

        /**
         * Creates a plain object from a MessageQuery message. Also converts values to other types if specified.
         * @param message MessageQuery
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.MessageQuery, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this MessageQuery to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for MessageQuery
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace MessageQuery {

        /** Properties of a MessageQuery. */
        interface $Properties {

            /** MessageQuery switchDisplay */
            switchDisplay?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a MessageQuery. */
        type $Shape = hbb.MessageQuery.$Properties;
    }

    /**
     * Properties of a Misc.
     * @deprecated Use hbb.Misc.$Properties instead.
     */
    interface IMisc extends hbb.Misc.$Properties {
    }

    /** Represents a Misc. */
    class Misc {

        /**
         * Constructs a new Misc.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Misc.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Misc chatMessage. */
        chatMessage?: (hbb.ChatMessage.$Properties|null);

        /** Misc switchDisplay. */
        switchDisplay?: (hbb.SwitchDisplay.$Properties|null);

        /** Misc permissionInfo. */
        permissionInfo?: (hbb.PermissionInfo.$Properties|null);

        /** Misc option. */
        option?: (hbb.OptionMessage.$Properties|null);

        /** Misc audioFormat. */
        audioFormat?: (hbb.AudioFormat.$Properties|null);

        /** Misc closeReason. */
        closeReason?: (string|null);

        /** Misc refreshVideo. */
        refreshVideo?: (boolean|null);

        /** Misc videoReceived. */
        videoReceived?: (boolean|null);

        /** Misc backNotification. */
        backNotification?: (hbb.BackNotification.$Properties|null);

        /** Misc restartRemoteDevice. */
        restartRemoteDevice?: (boolean|null);

        /** Misc uac. */
        uac?: (boolean|null);

        /** Misc foregroundWindowElevated. */
        foregroundWindowElevated?: (boolean|null);

        /** Misc stopService. */
        stopService?: (boolean|null);

        /** Misc elevationRequest. */
        elevationRequest?: (hbb.ElevationRequest.$Properties|null);

        /** Misc elevationResponse. */
        elevationResponse?: (string|null);

        /** Misc portableServiceRunning. */
        portableServiceRunning?: (boolean|null);

        /** Misc switchSidesRequest. */
        switchSidesRequest?: (hbb.SwitchSidesRequest.$Properties|null);

        /** Misc switchBack. */
        switchBack?: (hbb.SwitchBack.$Properties|null);

        /** Misc changeResolution. */
        changeResolution?: (hbb.Resolution.$Properties|null);

        /** Misc pluginRequest. */
        pluginRequest?: (hbb.PluginRequest.$Properties|null);

        /** Misc pluginFailure. */
        pluginFailure?: (hbb.PluginFailure.$Properties|null);

        /** Misc fullSpeedFps. */
        fullSpeedFps?: (number|null);

        /** Misc autoAdjustFps. */
        autoAdjustFps?: (number|null);

        /** Misc clientRecordStatus. */
        clientRecordStatus?: (boolean|null);

        /** Misc captureDisplays. */
        captureDisplays?: (hbb.CaptureDisplays.$Properties|null);

        /** Misc refreshVideoDisplay. */
        refreshVideoDisplay?: (number|null);

        /** Misc toggleVirtualDisplay. */
        toggleVirtualDisplay?: (hbb.ToggleVirtualDisplay.$Properties|null);

        /** Misc togglePrivacyMode. */
        togglePrivacyMode?: (hbb.TogglePrivacyMode.$Properties|null);

        /** Misc supportedEncoding. */
        supportedEncoding?: (hbb.SupportedEncoding.$Properties|null);

        /** Misc selectedSid. */
        selectedSid?: (number|null);

        /** Misc changeDisplayResolution. */
        changeDisplayResolution?: (hbb.DisplayResolution.$Properties|null);

        /** Misc messageQuery. */
        messageQuery?: (hbb.MessageQuery.$Properties|null);

        /** Misc followCurrentDisplay. */
        followCurrentDisplay?: (number|null);

        /** Misc union. */
        union?: ("chatMessage"|"switchDisplay"|"permissionInfo"|"option"|"audioFormat"|"closeReason"|"refreshVideo"|"videoReceived"|"backNotification"|"restartRemoteDevice"|"uac"|"foregroundWindowElevated"|"stopService"|"elevationRequest"|"elevationResponse"|"portableServiceRunning"|"switchSidesRequest"|"switchBack"|"changeResolution"|"pluginRequest"|"pluginFailure"|"fullSpeedFps"|"autoAdjustFps"|"clientRecordStatus"|"captureDisplays"|"refreshVideoDisplay"|"toggleVirtualDisplay"|"togglePrivacyMode"|"supportedEncoding"|"selectedSid"|"changeDisplayResolution"|"messageQuery"|"followCurrentDisplay");

        /**
         * Creates a new Misc instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Misc instance
         */
        static create(properties: hbb.Misc.$Shape): hbb.Misc & hbb.Misc.$Shape;
        static create(properties?: hbb.Misc.$Properties): hbb.Misc;

        /**
         * Encodes the specified Misc message. Does not implicitly {@link hbb.Misc.verify|verify} messages.
         * @param message Misc message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Misc.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Misc message, length delimited. Does not implicitly {@link hbb.Misc.verify|verify} messages.
         * @param message Misc message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Misc.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Misc message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Misc & hbb.Misc.$Shape} Misc
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Misc & hbb.Misc.$Shape;

        /**
         * Decodes a Misc message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Misc & hbb.Misc.$Shape} Misc
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Misc & hbb.Misc.$Shape;

        /**
         * Verifies a Misc message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Misc message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Misc
         */
        static fromObject(object: { [k: string]: any }): hbb.Misc;

        /**
         * Creates a plain object from a Misc message. Also converts values to other types if specified.
         * @param message Misc
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Misc, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Misc to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Misc
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Misc {

        /** Properties of a Misc. */
        interface $Properties {

            /** Misc chatMessage */
            chatMessage?: (hbb.ChatMessage.$Properties|null);

            /** Misc switchDisplay */
            switchDisplay?: (hbb.SwitchDisplay.$Properties|null);

            /** Misc permissionInfo */
            permissionInfo?: (hbb.PermissionInfo.$Properties|null);

            /** Misc option */
            option?: (hbb.OptionMessage.$Properties|null);

            /** Misc audioFormat */
            audioFormat?: (hbb.AudioFormat.$Properties|null);

            /** Misc closeReason */
            closeReason?: (string|null);

            /** Misc refreshVideo */
            refreshVideo?: (boolean|null);

            /** Misc videoReceived */
            videoReceived?: (boolean|null);

            /** Misc backNotification */
            backNotification?: (hbb.BackNotification.$Properties|null);

            /** Misc restartRemoteDevice */
            restartRemoteDevice?: (boolean|null);

            /** Misc uac */
            uac?: (boolean|null);

            /** Misc foregroundWindowElevated */
            foregroundWindowElevated?: (boolean|null);

            /** Misc stopService */
            stopService?: (boolean|null);

            /** Misc elevationRequest */
            elevationRequest?: (hbb.ElevationRequest.$Properties|null);

            /** Misc elevationResponse */
            elevationResponse?: (string|null);

            /** Misc portableServiceRunning */
            portableServiceRunning?: (boolean|null);

            /** Misc switchSidesRequest */
            switchSidesRequest?: (hbb.SwitchSidesRequest.$Properties|null);

            /** Misc switchBack */
            switchBack?: (hbb.SwitchBack.$Properties|null);

            /** Misc changeResolution */
            changeResolution?: (hbb.Resolution.$Properties|null);

            /** Misc pluginRequest */
            pluginRequest?: (hbb.PluginRequest.$Properties|null);

            /** Misc pluginFailure */
            pluginFailure?: (hbb.PluginFailure.$Properties|null);

            /** Misc fullSpeedFps */
            fullSpeedFps?: (number|null);

            /** Misc autoAdjustFps */
            autoAdjustFps?: (number|null);

            /** Misc clientRecordStatus */
            clientRecordStatus?: (boolean|null);

            /** Misc captureDisplays */
            captureDisplays?: (hbb.CaptureDisplays.$Properties|null);

            /** Misc refreshVideoDisplay */
            refreshVideoDisplay?: (number|null);

            /** Misc toggleVirtualDisplay */
            toggleVirtualDisplay?: (hbb.ToggleVirtualDisplay.$Properties|null);

            /** Misc togglePrivacyMode */
            togglePrivacyMode?: (hbb.TogglePrivacyMode.$Properties|null);

            /** Misc supportedEncoding */
            supportedEncoding?: (hbb.SupportedEncoding.$Properties|null);

            /** Misc selectedSid */
            selectedSid?: (number|null);

            /** Misc changeDisplayResolution */
            changeDisplayResolution?: (hbb.DisplayResolution.$Properties|null);

            /** Misc messageQuery */
            messageQuery?: (hbb.MessageQuery.$Properties|null);

            /** Misc followCurrentDisplay */
            followCurrentDisplay?: (number|null);

            /** Misc union */
            union?: ("chatMessage"|"switchDisplay"|"permissionInfo"|"option"|"audioFormat"|"closeReason"|"refreshVideo"|"videoReceived"|"backNotification"|"restartRemoteDevice"|"uac"|"foregroundWindowElevated"|"stopService"|"elevationRequest"|"elevationResponse"|"portableServiceRunning"|"switchSidesRequest"|"switchBack"|"changeResolution"|"pluginRequest"|"pluginFailure"|"fullSpeedFps"|"autoAdjustFps"|"clientRecordStatus"|"captureDisplays"|"refreshVideoDisplay"|"toggleVirtualDisplay"|"togglePrivacyMode"|"supportedEncoding"|"selectedSid"|"changeDisplayResolution"|"messageQuery"|"followCurrentDisplay");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a Misc. */
        type $Shape = {
          chatMessage?: hbb.ChatMessage.$Shape|null;
          switchDisplay?: hbb.SwitchDisplay.$Shape|null;
          permissionInfo?: hbb.PermissionInfo.$Shape|null;
          option?: hbb.OptionMessage.$Shape|null;
          audioFormat?: hbb.AudioFormat.$Shape|null;
          closeReason?: string|null;
          refreshVideo?: boolean|null;
          videoReceived?: boolean|null;
          backNotification?: hbb.BackNotification.$Shape|null;
          restartRemoteDevice?: boolean|null;
          uac?: boolean|null;
          foregroundWindowElevated?: boolean|null;
          stopService?: boolean|null;
          elevationRequest?: hbb.ElevationRequest.$Shape|null;
          elevationResponse?: string|null;
          portableServiceRunning?: boolean|null;
          switchSidesRequest?: hbb.SwitchSidesRequest.$Shape|null;
          switchBack?: hbb.SwitchBack.$Shape|null;
          changeResolution?: hbb.Resolution.$Shape|null;
          pluginRequest?: hbb.PluginRequest.$Shape|null;
          pluginFailure?: hbb.PluginFailure.$Shape|null;
          fullSpeedFps?: number|null;
          autoAdjustFps?: number|null;
          clientRecordStatus?: boolean|null;
          captureDisplays?: hbb.CaptureDisplays.$Shape|null;
          refreshVideoDisplay?: number|null;
          toggleVirtualDisplay?: hbb.ToggleVirtualDisplay.$Shape|null;
          togglePrivacyMode?: hbb.TogglePrivacyMode.$Shape|null;
          supportedEncoding?: hbb.SupportedEncoding.$Shape|null;
          selectedSid?: number|null;
          changeDisplayResolution?: hbb.DisplayResolution.$Shape|null;
          messageQuery?: hbb.MessageQuery.$Shape|null;
          followCurrentDisplay?: number|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "chatMessage"; chatMessage: hbb.ChatMessage.$Shape; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "switchDisplay"; chatMessage?: null; switchDisplay: hbb.SwitchDisplay.$Shape; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "permissionInfo"; chatMessage?: null; switchDisplay?: null; permissionInfo: hbb.PermissionInfo.$Shape; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "option"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option: hbb.OptionMessage.$Shape; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "audioFormat"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat: hbb.AudioFormat.$Shape; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "closeReason"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason: string; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "refreshVideo"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo: boolean; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "videoReceived"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived: boolean; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "backNotification"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification: hbb.BackNotification.$Shape; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "restartRemoteDevice"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice: boolean; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "uac"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac: boolean; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "foregroundWindowElevated"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated: boolean; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "stopService"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService: boolean; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "elevationRequest"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest: hbb.ElevationRequest.$Shape; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "elevationResponse"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse: string; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "portableServiceRunning"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning: boolean; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "switchSidesRequest"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest: hbb.SwitchSidesRequest.$Shape; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "switchBack"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack: hbb.SwitchBack.$Shape; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "changeResolution"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution: hbb.Resolution.$Shape; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "pluginRequest"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest: hbb.PluginRequest.$Shape; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "pluginFailure"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure: hbb.PluginFailure.$Shape; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "fullSpeedFps"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps: number; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "autoAdjustFps"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps: number; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "clientRecordStatus"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus: boolean; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "captureDisplays"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays: hbb.CaptureDisplays.$Shape; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "refreshVideoDisplay"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay: number; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "toggleVirtualDisplay"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay: hbb.ToggleVirtualDisplay.$Shape; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "togglePrivacyMode"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode: hbb.TogglePrivacyMode.$Shape; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "supportedEncoding"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding: hbb.SupportedEncoding.$Shape; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "selectedSid"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid: number; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "changeDisplayResolution"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution: hbb.DisplayResolution.$Shape; messageQuery?: null; followCurrentDisplay?: null }|{ union?: "messageQuery"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery: hbb.MessageQuery.$Shape; followCurrentDisplay?: null }|{ union?: "followCurrentDisplay"; chatMessage?: null; switchDisplay?: null; permissionInfo?: null; option?: null; audioFormat?: null; closeReason?: null; refreshVideo?: null; videoReceived?: null; backNotification?: null; restartRemoteDevice?: null; uac?: null; foregroundWindowElevated?: null; stopService?: null; elevationRequest?: null; elevationResponse?: null; portableServiceRunning?: null; switchSidesRequest?: null; switchBack?: null; changeResolution?: null; pluginRequest?: null; pluginFailure?: null; fullSpeedFps?: null; autoAdjustFps?: null; clientRecordStatus?: null; captureDisplays?: null; refreshVideoDisplay?: null; toggleVirtualDisplay?: null; togglePrivacyMode?: null; supportedEncoding?: null; selectedSid?: null; changeDisplayResolution?: null; messageQuery?: null; followCurrentDisplay: number })
        );
    }

    /**
     * Properties of a VoiceCallRequest.
     * @deprecated Use hbb.VoiceCallRequest.$Properties instead.
     */
    interface IVoiceCallRequest extends hbb.VoiceCallRequest.$Properties {
    }

    /** Represents a VoiceCallRequest. */
    class VoiceCallRequest {

        /**
         * Constructs a new VoiceCallRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.VoiceCallRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** VoiceCallRequest reqTimestamp. */
        reqTimestamp: (number|Long);

        /** VoiceCallRequest isConnect. */
        isConnect: boolean;

        /**
         * Creates a new VoiceCallRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns VoiceCallRequest instance
         */
        static create(properties: hbb.VoiceCallRequest.$Shape): hbb.VoiceCallRequest & hbb.VoiceCallRequest.$Shape;
        static create(properties?: hbb.VoiceCallRequest.$Properties): hbb.VoiceCallRequest;

        /**
         * Encodes the specified VoiceCallRequest message. Does not implicitly {@link hbb.VoiceCallRequest.verify|verify} messages.
         * @param message VoiceCallRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.VoiceCallRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified VoiceCallRequest message, length delimited. Does not implicitly {@link hbb.VoiceCallRequest.verify|verify} messages.
         * @param message VoiceCallRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.VoiceCallRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a VoiceCallRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.VoiceCallRequest & hbb.VoiceCallRequest.$Shape} VoiceCallRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.VoiceCallRequest & hbb.VoiceCallRequest.$Shape;

        /**
         * Decodes a VoiceCallRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.VoiceCallRequest & hbb.VoiceCallRequest.$Shape} VoiceCallRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.VoiceCallRequest & hbb.VoiceCallRequest.$Shape;

        /**
         * Verifies a VoiceCallRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a VoiceCallRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns VoiceCallRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.VoiceCallRequest;

        /**
         * Creates a plain object from a VoiceCallRequest message. Also converts values to other types if specified.
         * @param message VoiceCallRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.VoiceCallRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this VoiceCallRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for VoiceCallRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace VoiceCallRequest {

        /** Properties of a VoiceCallRequest. */
        interface $Properties {

            /** VoiceCallRequest reqTimestamp */
            reqTimestamp?: (number|Long|null);

            /** VoiceCallRequest isConnect */
            isConnect?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a VoiceCallRequest. */
        type $Shape = hbb.VoiceCallRequest.$Properties;
    }

    /**
     * Properties of a VoiceCallResponse.
     * @deprecated Use hbb.VoiceCallResponse.$Properties instead.
     */
    interface IVoiceCallResponse extends hbb.VoiceCallResponse.$Properties {
    }

    /** Represents a VoiceCallResponse. */
    class VoiceCallResponse {

        /**
         * Constructs a new VoiceCallResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.VoiceCallResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** VoiceCallResponse accepted. */
        accepted: boolean;

        /** VoiceCallResponse reqTimestamp. */
        reqTimestamp: (number|Long);

        /** VoiceCallResponse ackTimestamp. */
        ackTimestamp: (number|Long);

        /**
         * Creates a new VoiceCallResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns VoiceCallResponse instance
         */
        static create(properties: hbb.VoiceCallResponse.$Shape): hbb.VoiceCallResponse & hbb.VoiceCallResponse.$Shape;
        static create(properties?: hbb.VoiceCallResponse.$Properties): hbb.VoiceCallResponse;

        /**
         * Encodes the specified VoiceCallResponse message. Does not implicitly {@link hbb.VoiceCallResponse.verify|verify} messages.
         * @param message VoiceCallResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.VoiceCallResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified VoiceCallResponse message, length delimited. Does not implicitly {@link hbb.VoiceCallResponse.verify|verify} messages.
         * @param message VoiceCallResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.VoiceCallResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a VoiceCallResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.VoiceCallResponse & hbb.VoiceCallResponse.$Shape} VoiceCallResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.VoiceCallResponse & hbb.VoiceCallResponse.$Shape;

        /**
         * Decodes a VoiceCallResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.VoiceCallResponse & hbb.VoiceCallResponse.$Shape} VoiceCallResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.VoiceCallResponse & hbb.VoiceCallResponse.$Shape;

        /**
         * Verifies a VoiceCallResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a VoiceCallResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns VoiceCallResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.VoiceCallResponse;

        /**
         * Creates a plain object from a VoiceCallResponse message. Also converts values to other types if specified.
         * @param message VoiceCallResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.VoiceCallResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this VoiceCallResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for VoiceCallResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace VoiceCallResponse {

        /** Properties of a VoiceCallResponse. */
        interface $Properties {

            /** VoiceCallResponse accepted */
            accepted?: (boolean|null);

            /** VoiceCallResponse reqTimestamp */
            reqTimestamp?: (number|Long|null);

            /** VoiceCallResponse ackTimestamp */
            ackTimestamp?: (number|Long|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a VoiceCallResponse. */
        type $Shape = hbb.VoiceCallResponse.$Properties;
    }

    /**
     * Properties of a ScreenshotRequest.
     * @deprecated Use hbb.ScreenshotRequest.$Properties instead.
     */
    interface IScreenshotRequest extends hbb.ScreenshotRequest.$Properties {
    }

    /** Represents a ScreenshotRequest. */
    class ScreenshotRequest {

        /**
         * Constructs a new ScreenshotRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ScreenshotRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ScreenshotRequest display. */
        display: number;

        /** ScreenshotRequest sid. */
        sid: string;

        /**
         * Creates a new ScreenshotRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ScreenshotRequest instance
         */
        static create(properties: hbb.ScreenshotRequest.$Shape): hbb.ScreenshotRequest & hbb.ScreenshotRequest.$Shape;
        static create(properties?: hbb.ScreenshotRequest.$Properties): hbb.ScreenshotRequest;

        /**
         * Encodes the specified ScreenshotRequest message. Does not implicitly {@link hbb.ScreenshotRequest.verify|verify} messages.
         * @param message ScreenshotRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ScreenshotRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ScreenshotRequest message, length delimited. Does not implicitly {@link hbb.ScreenshotRequest.verify|verify} messages.
         * @param message ScreenshotRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ScreenshotRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ScreenshotRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ScreenshotRequest & hbb.ScreenshotRequest.$Shape} ScreenshotRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ScreenshotRequest & hbb.ScreenshotRequest.$Shape;

        /**
         * Decodes a ScreenshotRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ScreenshotRequest & hbb.ScreenshotRequest.$Shape} ScreenshotRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ScreenshotRequest & hbb.ScreenshotRequest.$Shape;

        /**
         * Verifies a ScreenshotRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ScreenshotRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ScreenshotRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.ScreenshotRequest;

        /**
         * Creates a plain object from a ScreenshotRequest message. Also converts values to other types if specified.
         * @param message ScreenshotRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ScreenshotRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ScreenshotRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ScreenshotRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ScreenshotRequest {

        /** Properties of a ScreenshotRequest. */
        interface $Properties {

            /** ScreenshotRequest display */
            display?: (number|null);

            /** ScreenshotRequest sid */
            sid?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ScreenshotRequest. */
        type $Shape = hbb.ScreenshotRequest.$Properties;
    }

    /**
     * Properties of a ScreenshotResponse.
     * @deprecated Use hbb.ScreenshotResponse.$Properties instead.
     */
    interface IScreenshotResponse extends hbb.ScreenshotResponse.$Properties {
    }

    /** Represents a ScreenshotResponse. */
    class ScreenshotResponse {

        /**
         * Constructs a new ScreenshotResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ScreenshotResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ScreenshotResponse sid. */
        sid: string;

        /** ScreenshotResponse msg. */
        msg: string;

        /** ScreenshotResponse data. */
        data: Uint8Array;

        /**
         * Creates a new ScreenshotResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ScreenshotResponse instance
         */
        static create(properties: hbb.ScreenshotResponse.$Shape): hbb.ScreenshotResponse & hbb.ScreenshotResponse.$Shape;
        static create(properties?: hbb.ScreenshotResponse.$Properties): hbb.ScreenshotResponse;

        /**
         * Encodes the specified ScreenshotResponse message. Does not implicitly {@link hbb.ScreenshotResponse.verify|verify} messages.
         * @param message ScreenshotResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ScreenshotResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ScreenshotResponse message, length delimited. Does not implicitly {@link hbb.ScreenshotResponse.verify|verify} messages.
         * @param message ScreenshotResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ScreenshotResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ScreenshotResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ScreenshotResponse & hbb.ScreenshotResponse.$Shape} ScreenshotResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ScreenshotResponse & hbb.ScreenshotResponse.$Shape;

        /**
         * Decodes a ScreenshotResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ScreenshotResponse & hbb.ScreenshotResponse.$Shape} ScreenshotResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ScreenshotResponse & hbb.ScreenshotResponse.$Shape;

        /**
         * Verifies a ScreenshotResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ScreenshotResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ScreenshotResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.ScreenshotResponse;

        /**
         * Creates a plain object from a ScreenshotResponse message. Also converts values to other types if specified.
         * @param message ScreenshotResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ScreenshotResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ScreenshotResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ScreenshotResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ScreenshotResponse {

        /** Properties of a ScreenshotResponse. */
        interface $Properties {

            /** ScreenshotResponse sid */
            sid?: (string|null);

            /** ScreenshotResponse msg */
            msg?: (string|null);

            /** ScreenshotResponse data */
            data?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ScreenshotResponse. */
        type $Shape = hbb.ScreenshotResponse.$Properties;
    }

    /**
     * Properties of an OpenTerminal.
     * @deprecated Use hbb.OpenTerminal.$Properties instead.
     */
    interface IOpenTerminal extends hbb.OpenTerminal.$Properties {
    }

    /** Represents an OpenTerminal. */
    class OpenTerminal {

        /**
         * Constructs a new OpenTerminal.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.OpenTerminal.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** OpenTerminal terminalId. */
        terminalId: number;

        /** OpenTerminal rows. */
        rows: number;

        /** OpenTerminal cols. */
        cols: number;

        /**
         * Creates a new OpenTerminal instance using the specified properties.
         * @param [properties] Properties to set
         * @returns OpenTerminal instance
         */
        static create(properties: hbb.OpenTerminal.$Shape): hbb.OpenTerminal & hbb.OpenTerminal.$Shape;
        static create(properties?: hbb.OpenTerminal.$Properties): hbb.OpenTerminal;

        /**
         * Encodes the specified OpenTerminal message. Does not implicitly {@link hbb.OpenTerminal.verify|verify} messages.
         * @param message OpenTerminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.OpenTerminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified OpenTerminal message, length delimited. Does not implicitly {@link hbb.OpenTerminal.verify|verify} messages.
         * @param message OpenTerminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.OpenTerminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an OpenTerminal message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.OpenTerminal & hbb.OpenTerminal.$Shape} OpenTerminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.OpenTerminal & hbb.OpenTerminal.$Shape;

        /**
         * Decodes an OpenTerminal message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.OpenTerminal & hbb.OpenTerminal.$Shape} OpenTerminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.OpenTerminal & hbb.OpenTerminal.$Shape;

        /**
         * Verifies an OpenTerminal message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an OpenTerminal message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns OpenTerminal
         */
        static fromObject(object: { [k: string]: any }): hbb.OpenTerminal;

        /**
         * Creates a plain object from an OpenTerminal message. Also converts values to other types if specified.
         * @param message OpenTerminal
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.OpenTerminal, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this OpenTerminal to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for OpenTerminal
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace OpenTerminal {

        /** Properties of an OpenTerminal. */
        interface $Properties {

            /** OpenTerminal terminalId */
            terminalId?: (number|null);

            /** OpenTerminal rows */
            rows?: (number|null);

            /** OpenTerminal cols */
            cols?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an OpenTerminal. */
        type $Shape = hbb.OpenTerminal.$Properties;
    }

    /**
     * Properties of a ResizeTerminal.
     * @deprecated Use hbb.ResizeTerminal.$Properties instead.
     */
    interface IResizeTerminal extends hbb.ResizeTerminal.$Properties {
    }

    /** Represents a ResizeTerminal. */
    class ResizeTerminal {

        /**
         * Constructs a new ResizeTerminal.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ResizeTerminal.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ResizeTerminal terminalId. */
        terminalId: number;

        /** ResizeTerminal rows. */
        rows: number;

        /** ResizeTerminal cols. */
        cols: number;

        /**
         * Creates a new ResizeTerminal instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ResizeTerminal instance
         */
        static create(properties: hbb.ResizeTerminal.$Shape): hbb.ResizeTerminal & hbb.ResizeTerminal.$Shape;
        static create(properties?: hbb.ResizeTerminal.$Properties): hbb.ResizeTerminal;

        /**
         * Encodes the specified ResizeTerminal message. Does not implicitly {@link hbb.ResizeTerminal.verify|verify} messages.
         * @param message ResizeTerminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ResizeTerminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ResizeTerminal message, length delimited. Does not implicitly {@link hbb.ResizeTerminal.verify|verify} messages.
         * @param message ResizeTerminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ResizeTerminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ResizeTerminal message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ResizeTerminal & hbb.ResizeTerminal.$Shape} ResizeTerminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ResizeTerminal & hbb.ResizeTerminal.$Shape;

        /**
         * Decodes a ResizeTerminal message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ResizeTerminal & hbb.ResizeTerminal.$Shape} ResizeTerminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ResizeTerminal & hbb.ResizeTerminal.$Shape;

        /**
         * Verifies a ResizeTerminal message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ResizeTerminal message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ResizeTerminal
         */
        static fromObject(object: { [k: string]: any }): hbb.ResizeTerminal;

        /**
         * Creates a plain object from a ResizeTerminal message. Also converts values to other types if specified.
         * @param message ResizeTerminal
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ResizeTerminal, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ResizeTerminal to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ResizeTerminal
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ResizeTerminal {

        /** Properties of a ResizeTerminal. */
        interface $Properties {

            /** ResizeTerminal terminalId */
            terminalId?: (number|null);

            /** ResizeTerminal rows */
            rows?: (number|null);

            /** ResizeTerminal cols */
            cols?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ResizeTerminal. */
        type $Shape = hbb.ResizeTerminal.$Properties;
    }

    /**
     * Properties of a TerminalData.
     * @deprecated Use hbb.TerminalData.$Properties instead.
     */
    interface ITerminalData extends hbb.TerminalData.$Properties {
    }

    /** Represents a TerminalData. */
    class TerminalData {

        /**
         * Constructs a new TerminalData.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TerminalData.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TerminalData terminalId. */
        terminalId: number;

        /** TerminalData data. */
        data: Uint8Array;

        /** TerminalData compressed. */
        compressed: boolean;

        /**
         * Creates a new TerminalData instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TerminalData instance
         */
        static create(properties: hbb.TerminalData.$Shape): hbb.TerminalData & hbb.TerminalData.$Shape;
        static create(properties?: hbb.TerminalData.$Properties): hbb.TerminalData;

        /**
         * Encodes the specified TerminalData message. Does not implicitly {@link hbb.TerminalData.verify|verify} messages.
         * @param message TerminalData message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TerminalData.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TerminalData message, length delimited. Does not implicitly {@link hbb.TerminalData.verify|verify} messages.
         * @param message TerminalData message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TerminalData.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TerminalData message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TerminalData & hbb.TerminalData.$Shape} TerminalData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TerminalData & hbb.TerminalData.$Shape;

        /**
         * Decodes a TerminalData message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TerminalData & hbb.TerminalData.$Shape} TerminalData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TerminalData & hbb.TerminalData.$Shape;

        /**
         * Verifies a TerminalData message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TerminalData message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TerminalData
         */
        static fromObject(object: { [k: string]: any }): hbb.TerminalData;

        /**
         * Creates a plain object from a TerminalData message. Also converts values to other types if specified.
         * @param message TerminalData
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TerminalData, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TerminalData to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TerminalData
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TerminalData {

        /** Properties of a TerminalData. */
        interface $Properties {

            /** TerminalData terminalId */
            terminalId?: (number|null);

            /** TerminalData data */
            data?: (Uint8Array|null);

            /** TerminalData compressed */
            compressed?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TerminalData. */
        type $Shape = hbb.TerminalData.$Properties;
    }

    /**
     * Properties of a CloseTerminal.
     * @deprecated Use hbb.CloseTerminal.$Properties instead.
     */
    interface ICloseTerminal extends hbb.CloseTerminal.$Properties {
    }

    /** Represents a CloseTerminal. */
    class CloseTerminal {

        /**
         * Constructs a new CloseTerminal.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.CloseTerminal.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** CloseTerminal terminalId. */
        terminalId: number;

        /**
         * Creates a new CloseTerminal instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CloseTerminal instance
         */
        static create(properties: hbb.CloseTerminal.$Shape): hbb.CloseTerminal & hbb.CloseTerminal.$Shape;
        static create(properties?: hbb.CloseTerminal.$Properties): hbb.CloseTerminal;

        /**
         * Encodes the specified CloseTerminal message. Does not implicitly {@link hbb.CloseTerminal.verify|verify} messages.
         * @param message CloseTerminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.CloseTerminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CloseTerminal message, length delimited. Does not implicitly {@link hbb.CloseTerminal.verify|verify} messages.
         * @param message CloseTerminal message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.CloseTerminal.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CloseTerminal message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.CloseTerminal & hbb.CloseTerminal.$Shape} CloseTerminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.CloseTerminal & hbb.CloseTerminal.$Shape;

        /**
         * Decodes a CloseTerminal message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.CloseTerminal & hbb.CloseTerminal.$Shape} CloseTerminal
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.CloseTerminal & hbb.CloseTerminal.$Shape;

        /**
         * Verifies a CloseTerminal message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CloseTerminal message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CloseTerminal
         */
        static fromObject(object: { [k: string]: any }): hbb.CloseTerminal;

        /**
         * Creates a plain object from a CloseTerminal message. Also converts values to other types if specified.
         * @param message CloseTerminal
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.CloseTerminal, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CloseTerminal to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for CloseTerminal
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace CloseTerminal {

        /** Properties of a CloseTerminal. */
        interface $Properties {

            /** CloseTerminal terminalId */
            terminalId?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a CloseTerminal. */
        type $Shape = hbb.CloseTerminal.$Properties;
    }

    /**
     * Properties of a TerminalAction.
     * @deprecated Use hbb.TerminalAction.$Properties instead.
     */
    interface ITerminalAction extends hbb.TerminalAction.$Properties {
    }

    /** Represents a TerminalAction. */
    class TerminalAction {

        /**
         * Constructs a new TerminalAction.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TerminalAction.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TerminalAction open. */
        open?: (hbb.OpenTerminal.$Properties|null);

        /** TerminalAction data. */
        data?: (hbb.TerminalData.$Properties|null);

        /** TerminalAction resize. */
        resize?: (hbb.ResizeTerminal.$Properties|null);

        /** TerminalAction close. */
        close?: (hbb.CloseTerminal.$Properties|null);

        /** TerminalAction union. */
        union?: ("open"|"data"|"resize"|"close");

        /**
         * Creates a new TerminalAction instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TerminalAction instance
         */
        static create(properties: hbb.TerminalAction.$Shape): hbb.TerminalAction & hbb.TerminalAction.$Shape;
        static create(properties?: hbb.TerminalAction.$Properties): hbb.TerminalAction;

        /**
         * Encodes the specified TerminalAction message. Does not implicitly {@link hbb.TerminalAction.verify|verify} messages.
         * @param message TerminalAction message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TerminalAction.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TerminalAction message, length delimited. Does not implicitly {@link hbb.TerminalAction.verify|verify} messages.
         * @param message TerminalAction message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TerminalAction.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TerminalAction message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TerminalAction & hbb.TerminalAction.$Shape} TerminalAction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TerminalAction & hbb.TerminalAction.$Shape;

        /**
         * Decodes a TerminalAction message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TerminalAction & hbb.TerminalAction.$Shape} TerminalAction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TerminalAction & hbb.TerminalAction.$Shape;

        /**
         * Verifies a TerminalAction message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TerminalAction message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TerminalAction
         */
        static fromObject(object: { [k: string]: any }): hbb.TerminalAction;

        /**
         * Creates a plain object from a TerminalAction message. Also converts values to other types if specified.
         * @param message TerminalAction
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TerminalAction, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TerminalAction to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TerminalAction
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TerminalAction {

        /** Properties of a TerminalAction. */
        interface $Properties {

            /** TerminalAction open */
            open?: (hbb.OpenTerminal.$Properties|null);

            /** TerminalAction data */
            data?: (hbb.TerminalData.$Properties|null);

            /** TerminalAction resize */
            resize?: (hbb.ResizeTerminal.$Properties|null);

            /** TerminalAction close */
            close?: (hbb.CloseTerminal.$Properties|null);

            /** TerminalAction union */
            union?: ("open"|"data"|"resize"|"close");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a TerminalAction. */
        type $Shape = {
          open?: hbb.OpenTerminal.$Shape|null;
          data?: hbb.TerminalData.$Shape|null;
          resize?: hbb.ResizeTerminal.$Shape|null;
          close?: hbb.CloseTerminal.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; open?: null; data?: null; resize?: null; close?: null }|{ union?: "open"; open: hbb.OpenTerminal.$Shape; data?: null; resize?: null; close?: null }|{ union?: "data"; open?: null; data: hbb.TerminalData.$Shape; resize?: null; close?: null }|{ union?: "resize"; open?: null; data?: null; resize: hbb.ResizeTerminal.$Shape; close?: null }|{ union?: "close"; open?: null; data?: null; resize?: null; close: hbb.CloseTerminal.$Shape })
        );
    }

    /**
     * Properties of a TerminalOpened.
     * @deprecated Use hbb.TerminalOpened.$Properties instead.
     */
    interface ITerminalOpened extends hbb.TerminalOpened.$Properties {
    }

    /** Represents a TerminalOpened. */
    class TerminalOpened {

        /**
         * Constructs a new TerminalOpened.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TerminalOpened.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TerminalOpened terminalId. */
        terminalId: number;

        /** TerminalOpened success. */
        success: boolean;

        /** TerminalOpened message. */
        message: string;

        /** TerminalOpened pid. */
        pid: number;

        /** TerminalOpened serviceId. */
        serviceId: string;

        /** TerminalOpened persistentSessions. */
        persistentSessions: number[];

        /**
         * Creates a new TerminalOpened instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TerminalOpened instance
         */
        static create(properties: hbb.TerminalOpened.$Shape): hbb.TerminalOpened & hbb.TerminalOpened.$Shape;
        static create(properties?: hbb.TerminalOpened.$Properties): hbb.TerminalOpened;

        /**
         * Encodes the specified TerminalOpened message. Does not implicitly {@link hbb.TerminalOpened.verify|verify} messages.
         * @param message TerminalOpened message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TerminalOpened.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TerminalOpened message, length delimited. Does not implicitly {@link hbb.TerminalOpened.verify|verify} messages.
         * @param message TerminalOpened message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TerminalOpened.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TerminalOpened message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TerminalOpened & hbb.TerminalOpened.$Shape} TerminalOpened
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TerminalOpened & hbb.TerminalOpened.$Shape;

        /**
         * Decodes a TerminalOpened message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TerminalOpened & hbb.TerminalOpened.$Shape} TerminalOpened
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TerminalOpened & hbb.TerminalOpened.$Shape;

        /**
         * Verifies a TerminalOpened message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TerminalOpened message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TerminalOpened
         */
        static fromObject(object: { [k: string]: any }): hbb.TerminalOpened;

        /**
         * Creates a plain object from a TerminalOpened message. Also converts values to other types if specified.
         * @param message TerminalOpened
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TerminalOpened, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TerminalOpened to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TerminalOpened
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TerminalOpened {

        /** Properties of a TerminalOpened. */
        interface $Properties {

            /** TerminalOpened terminalId */
            terminalId?: (number|null);

            /** TerminalOpened success */
            success?: (boolean|null);

            /** TerminalOpened message */
            message?: (string|null);

            /** TerminalOpened pid */
            pid?: (number|null);

            /** TerminalOpened serviceId */
            serviceId?: (string|null);

            /** TerminalOpened persistentSessions */
            persistentSessions?: (number[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TerminalOpened. */
        type $Shape = hbb.TerminalOpened.$Properties;
    }

    /**
     * Properties of a TerminalClosed.
     * @deprecated Use hbb.TerminalClosed.$Properties instead.
     */
    interface ITerminalClosed extends hbb.TerminalClosed.$Properties {
    }

    /** Represents a TerminalClosed. */
    class TerminalClosed {

        /**
         * Constructs a new TerminalClosed.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TerminalClosed.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TerminalClosed terminalId. */
        terminalId: number;

        /** TerminalClosed exitCode. */
        exitCode: number;

        /**
         * Creates a new TerminalClosed instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TerminalClosed instance
         */
        static create(properties: hbb.TerminalClosed.$Shape): hbb.TerminalClosed & hbb.TerminalClosed.$Shape;
        static create(properties?: hbb.TerminalClosed.$Properties): hbb.TerminalClosed;

        /**
         * Encodes the specified TerminalClosed message. Does not implicitly {@link hbb.TerminalClosed.verify|verify} messages.
         * @param message TerminalClosed message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TerminalClosed.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TerminalClosed message, length delimited. Does not implicitly {@link hbb.TerminalClosed.verify|verify} messages.
         * @param message TerminalClosed message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TerminalClosed.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TerminalClosed message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TerminalClosed & hbb.TerminalClosed.$Shape} TerminalClosed
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TerminalClosed & hbb.TerminalClosed.$Shape;

        /**
         * Decodes a TerminalClosed message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TerminalClosed & hbb.TerminalClosed.$Shape} TerminalClosed
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TerminalClosed & hbb.TerminalClosed.$Shape;

        /**
         * Verifies a TerminalClosed message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TerminalClosed message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TerminalClosed
         */
        static fromObject(object: { [k: string]: any }): hbb.TerminalClosed;

        /**
         * Creates a plain object from a TerminalClosed message. Also converts values to other types if specified.
         * @param message TerminalClosed
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TerminalClosed, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TerminalClosed to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TerminalClosed
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TerminalClosed {

        /** Properties of a TerminalClosed. */
        interface $Properties {

            /** TerminalClosed terminalId */
            terminalId?: (number|null);

            /** TerminalClosed exitCode */
            exitCode?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TerminalClosed. */
        type $Shape = hbb.TerminalClosed.$Properties;
    }

    /**
     * Properties of a TerminalError.
     * @deprecated Use hbb.TerminalError.$Properties instead.
     */
    interface ITerminalError extends hbb.TerminalError.$Properties {
    }

    /** Represents a TerminalError. */
    class TerminalError {

        /**
         * Constructs a new TerminalError.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TerminalError.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TerminalError terminalId. */
        terminalId: number;

        /** TerminalError message. */
        message: string;

        /**
         * Creates a new TerminalError instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TerminalError instance
         */
        static create(properties: hbb.TerminalError.$Shape): hbb.TerminalError & hbb.TerminalError.$Shape;
        static create(properties?: hbb.TerminalError.$Properties): hbb.TerminalError;

        /**
         * Encodes the specified TerminalError message. Does not implicitly {@link hbb.TerminalError.verify|verify} messages.
         * @param message TerminalError message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TerminalError.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TerminalError message, length delimited. Does not implicitly {@link hbb.TerminalError.verify|verify} messages.
         * @param message TerminalError message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TerminalError.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TerminalError message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TerminalError & hbb.TerminalError.$Shape} TerminalError
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TerminalError & hbb.TerminalError.$Shape;

        /**
         * Decodes a TerminalError message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TerminalError & hbb.TerminalError.$Shape} TerminalError
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TerminalError & hbb.TerminalError.$Shape;

        /**
         * Verifies a TerminalError message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TerminalError message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TerminalError
         */
        static fromObject(object: { [k: string]: any }): hbb.TerminalError;

        /**
         * Creates a plain object from a TerminalError message. Also converts values to other types if specified.
         * @param message TerminalError
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TerminalError, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TerminalError to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TerminalError
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TerminalError {

        /** Properties of a TerminalError. */
        interface $Properties {

            /** TerminalError terminalId */
            terminalId?: (number|null);

            /** TerminalError message */
            message?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TerminalError. */
        type $Shape = hbb.TerminalError.$Properties;
    }

    /**
     * Properties of a TerminalResponse.
     * @deprecated Use hbb.TerminalResponse.$Properties instead.
     */
    interface ITerminalResponse extends hbb.TerminalResponse.$Properties {
    }

    /** Represents a TerminalResponse. */
    class TerminalResponse {

        /**
         * Constructs a new TerminalResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TerminalResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TerminalResponse opened. */
        opened?: (hbb.TerminalOpened.$Properties|null);

        /** TerminalResponse data. */
        data?: (hbb.TerminalData.$Properties|null);

        /** TerminalResponse closed. */
        closed?: (hbb.TerminalClosed.$Properties|null);

        /** TerminalResponse error. */
        error?: (hbb.TerminalError.$Properties|null);

        /** TerminalResponse union. */
        union?: ("opened"|"data"|"closed"|"error");

        /**
         * Creates a new TerminalResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TerminalResponse instance
         */
        static create(properties: hbb.TerminalResponse.$Shape): hbb.TerminalResponse & hbb.TerminalResponse.$Shape;
        static create(properties?: hbb.TerminalResponse.$Properties): hbb.TerminalResponse;

        /**
         * Encodes the specified TerminalResponse message. Does not implicitly {@link hbb.TerminalResponse.verify|verify} messages.
         * @param message TerminalResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TerminalResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TerminalResponse message, length delimited. Does not implicitly {@link hbb.TerminalResponse.verify|verify} messages.
         * @param message TerminalResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TerminalResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TerminalResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TerminalResponse & hbb.TerminalResponse.$Shape} TerminalResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TerminalResponse & hbb.TerminalResponse.$Shape;

        /**
         * Decodes a TerminalResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TerminalResponse & hbb.TerminalResponse.$Shape} TerminalResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TerminalResponse & hbb.TerminalResponse.$Shape;

        /**
         * Verifies a TerminalResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TerminalResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TerminalResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.TerminalResponse;

        /**
         * Creates a plain object from a TerminalResponse message. Also converts values to other types if specified.
         * @param message TerminalResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TerminalResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TerminalResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TerminalResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TerminalResponse {

        /** Properties of a TerminalResponse. */
        interface $Properties {

            /** TerminalResponse opened */
            opened?: (hbb.TerminalOpened.$Properties|null);

            /** TerminalResponse data */
            data?: (hbb.TerminalData.$Properties|null);

            /** TerminalResponse closed */
            closed?: (hbb.TerminalClosed.$Properties|null);

            /** TerminalResponse error */
            error?: (hbb.TerminalError.$Properties|null);

            /** TerminalResponse union */
            union?: ("opened"|"data"|"closed"|"error");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a TerminalResponse. */
        type $Shape = {
          opened?: hbb.TerminalOpened.$Shape|null;
          data?: hbb.TerminalData.$Shape|null;
          closed?: hbb.TerminalClosed.$Shape|null;
          error?: hbb.TerminalError.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; opened?: null; data?: null; closed?: null; error?: null }|{ union?: "opened"; opened: hbb.TerminalOpened.$Shape; data?: null; closed?: null; error?: null }|{ union?: "data"; opened?: null; data: hbb.TerminalData.$Shape; closed?: null; error?: null }|{ union?: "closed"; opened?: null; data?: null; closed: hbb.TerminalClosed.$Shape; error?: null }|{ union?: "error"; opened?: null; data?: null; closed?: null; error: hbb.TerminalError.$Shape })
        );
    }

    /**
     * Properties of a Message.
     * @deprecated Use hbb.Message.$Properties instead.
     */
    interface IMessage extends hbb.Message.$Properties {
    }

    /** Represents a Message. */
    class Message {

        /**
         * Constructs a new Message.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.Message.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** Message signedId. */
        signedId?: (hbb.SignedId.$Properties|null);

        /** Message publicKey. */
        publicKey?: (hbb.PublicKey.$Properties|null);

        /** Message testDelay. */
        testDelay?: (hbb.TestDelay.$Properties|null);

        /** Message videoFrame. */
        videoFrame?: (hbb.VideoFrame.$Properties|null);

        /** Message loginRequest. */
        loginRequest?: (hbb.LoginRequest.$Properties|null);

        /** Message loginResponse. */
        loginResponse?: (hbb.LoginResponse.$Properties|null);

        /** Message hash. */
        hash?: (hbb.Hash.$Properties|null);

        /** Message mouseEvent. */
        mouseEvent?: (hbb.MouseEvent.$Properties|null);

        /** Message audioFrame. */
        audioFrame?: (hbb.AudioFrame.$Properties|null);

        /** Message cursorData. */
        cursorData?: (hbb.CursorData.$Properties|null);

        /** Message cursorPosition. */
        cursorPosition?: (hbb.CursorPosition.$Properties|null);

        /** Message cursorId. */
        cursorId?: (number|Long|null);

        /** Message keyEvent. */
        keyEvent?: (hbb.KeyEvent.$Properties|null);

        /** Message clipboard. */
        clipboard?: (hbb.Clipboard.$Properties|null);

        /** Message fileAction. */
        fileAction?: (hbb.FileAction.$Properties|null);

        /** Message fileResponse. */
        fileResponse?: (hbb.FileResponse.$Properties|null);

        /** Message misc. */
        misc?: (hbb.Misc.$Properties|null);

        /** Message cliprdr. */
        cliprdr?: (hbb.Cliprdr.$Properties|null);

        /** Message messageBox. */
        messageBox?: (hbb.MessageBox.$Properties|null);

        /** Message switchSidesResponse. */
        switchSidesResponse?: (hbb.SwitchSidesResponse.$Properties|null);

        /** Message voiceCallRequest. */
        voiceCallRequest?: (hbb.VoiceCallRequest.$Properties|null);

        /** Message voiceCallResponse. */
        voiceCallResponse?: (hbb.VoiceCallResponse.$Properties|null);

        /** Message peerInfo. */
        peerInfo?: (hbb.PeerInfo.$Properties|null);

        /** Message pointerDeviceEvent. */
        pointerDeviceEvent?: (hbb.PointerDeviceEvent.$Properties|null);

        /** Message auth_2fa. */
        auth_2fa?: (hbb.Auth2FA.$Properties|null);

        /** Message multiClipboards. */
        multiClipboards?: (hbb.MultiClipboards.$Properties|null);

        /** Message screenshotRequest. */
        screenshotRequest?: (hbb.ScreenshotRequest.$Properties|null);

        /** Message screenshotResponse. */
        screenshotResponse?: (hbb.ScreenshotResponse.$Properties|null);

        /** Message terminalAction. */
        terminalAction?: (hbb.TerminalAction.$Properties|null);

        /** Message terminalResponse. */
        terminalResponse?: (hbb.TerminalResponse.$Properties|null);

        /** Message union. */
        union?: ("signedId"|"publicKey"|"testDelay"|"videoFrame"|"loginRequest"|"loginResponse"|"hash"|"mouseEvent"|"audioFrame"|"cursorData"|"cursorPosition"|"cursorId"|"keyEvent"|"clipboard"|"fileAction"|"fileResponse"|"misc"|"cliprdr"|"messageBox"|"switchSidesResponse"|"voiceCallRequest"|"voiceCallResponse"|"peerInfo"|"pointerDeviceEvent"|"auth_2fa"|"multiClipboards"|"screenshotRequest"|"screenshotResponse"|"terminalAction"|"terminalResponse");

        /**
         * Creates a new Message instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Message instance
         */
        static create(properties: hbb.Message.$Shape): hbb.Message & hbb.Message.$Shape;
        static create(properties?: hbb.Message.$Properties): hbb.Message;

        /**
         * Encodes the specified Message message. Does not implicitly {@link hbb.Message.verify|verify} messages.
         * @param message Message message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.Message.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Message message, length delimited. Does not implicitly {@link hbb.Message.verify|verify} messages.
         * @param message Message message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.Message.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Message message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.Message & hbb.Message.$Shape} Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.Message & hbb.Message.$Shape;

        /**
         * Decodes a Message message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.Message & hbb.Message.$Shape} Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.Message & hbb.Message.$Shape;

        /**
         * Verifies a Message message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Message message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Message
         */
        static fromObject(object: { [k: string]: any }): hbb.Message;

        /**
         * Creates a plain object from a Message message. Also converts values to other types if specified.
         * @param message Message
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.Message, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Message to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for Message
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace Message {

        /** Properties of a Message. */
        interface $Properties {

            /** Message signedId */
            signedId?: (hbb.SignedId.$Properties|null);

            /** Message publicKey */
            publicKey?: (hbb.PublicKey.$Properties|null);

            /** Message testDelay */
            testDelay?: (hbb.TestDelay.$Properties|null);

            /** Message videoFrame */
            videoFrame?: (hbb.VideoFrame.$Properties|null);

            /** Message loginRequest */
            loginRequest?: (hbb.LoginRequest.$Properties|null);

            /** Message loginResponse */
            loginResponse?: (hbb.LoginResponse.$Properties|null);

            /** Message hash */
            hash?: (hbb.Hash.$Properties|null);

            /** Message mouseEvent */
            mouseEvent?: (hbb.MouseEvent.$Properties|null);

            /** Message audioFrame */
            audioFrame?: (hbb.AudioFrame.$Properties|null);

            /** Message cursorData */
            cursorData?: (hbb.CursorData.$Properties|null);

            /** Message cursorPosition */
            cursorPosition?: (hbb.CursorPosition.$Properties|null);

            /** Message cursorId */
            cursorId?: (number|Long|null);

            /** Message keyEvent */
            keyEvent?: (hbb.KeyEvent.$Properties|null);

            /** Message clipboard */
            clipboard?: (hbb.Clipboard.$Properties|null);

            /** Message fileAction */
            fileAction?: (hbb.FileAction.$Properties|null);

            /** Message fileResponse */
            fileResponse?: (hbb.FileResponse.$Properties|null);

            /** Message misc */
            misc?: (hbb.Misc.$Properties|null);

            /** Message cliprdr */
            cliprdr?: (hbb.Cliprdr.$Properties|null);

            /** Message messageBox */
            messageBox?: (hbb.MessageBox.$Properties|null);

            /** Message switchSidesResponse */
            switchSidesResponse?: (hbb.SwitchSidesResponse.$Properties|null);

            /** Message voiceCallRequest */
            voiceCallRequest?: (hbb.VoiceCallRequest.$Properties|null);

            /** Message voiceCallResponse */
            voiceCallResponse?: (hbb.VoiceCallResponse.$Properties|null);

            /** Message peerInfo */
            peerInfo?: (hbb.PeerInfo.$Properties|null);

            /** Message pointerDeviceEvent */
            pointerDeviceEvent?: (hbb.PointerDeviceEvent.$Properties|null);

            /** Message auth_2fa */
            auth_2fa?: (hbb.Auth2FA.$Properties|null);

            /** Message multiClipboards */
            multiClipboards?: (hbb.MultiClipboards.$Properties|null);

            /** Message screenshotRequest */
            screenshotRequest?: (hbb.ScreenshotRequest.$Properties|null);

            /** Message screenshotResponse */
            screenshotResponse?: (hbb.ScreenshotResponse.$Properties|null);

            /** Message terminalAction */
            terminalAction?: (hbb.TerminalAction.$Properties|null);

            /** Message terminalResponse */
            terminalResponse?: (hbb.TerminalResponse.$Properties|null);

            /** Message union */
            union?: ("signedId"|"publicKey"|"testDelay"|"videoFrame"|"loginRequest"|"loginResponse"|"hash"|"mouseEvent"|"audioFrame"|"cursorData"|"cursorPosition"|"cursorId"|"keyEvent"|"clipboard"|"fileAction"|"fileResponse"|"misc"|"cliprdr"|"messageBox"|"switchSidesResponse"|"voiceCallRequest"|"voiceCallResponse"|"peerInfo"|"pointerDeviceEvent"|"auth_2fa"|"multiClipboards"|"screenshotRequest"|"screenshotResponse"|"terminalAction"|"terminalResponse");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a Message. */
        type $Shape = {
          signedId?: hbb.SignedId.$Shape|null;
          publicKey?: hbb.PublicKey.$Shape|null;
          testDelay?: hbb.TestDelay.$Shape|null;
          videoFrame?: hbb.VideoFrame.$Shape|null;
          loginRequest?: hbb.LoginRequest.$Shape|null;
          loginResponse?: hbb.LoginResponse.$Shape|null;
          hash?: hbb.Hash.$Shape|null;
          mouseEvent?: hbb.MouseEvent.$Shape|null;
          audioFrame?: hbb.AudioFrame.$Shape|null;
          cursorData?: hbb.CursorData.$Shape|null;
          cursorPosition?: hbb.CursorPosition.$Shape|null;
          cursorId?: number|Long|null;
          keyEvent?: hbb.KeyEvent.$Shape|null;
          clipboard?: hbb.Clipboard.$Shape|null;
          fileAction?: hbb.FileAction.$Shape|null;
          fileResponse?: hbb.FileResponse.$Shape|null;
          misc?: hbb.Misc.$Shape|null;
          cliprdr?: hbb.Cliprdr.$Shape|null;
          messageBox?: hbb.MessageBox.$Shape|null;
          switchSidesResponse?: hbb.SwitchSidesResponse.$Shape|null;
          voiceCallRequest?: hbb.VoiceCallRequest.$Shape|null;
          voiceCallResponse?: hbb.VoiceCallResponse.$Shape|null;
          peerInfo?: hbb.PeerInfo.$Shape|null;
          pointerDeviceEvent?: hbb.PointerDeviceEvent.$Shape|null;
          auth_2fa?: hbb.Auth2FA.$Shape|null;
          multiClipboards?: hbb.MultiClipboards.$Shape|null;
          screenshotRequest?: hbb.ScreenshotRequest.$Shape|null;
          screenshotResponse?: hbb.ScreenshotResponse.$Shape|null;
          terminalAction?: hbb.TerminalAction.$Shape|null;
          terminalResponse?: hbb.TerminalResponse.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "signedId"; signedId: hbb.SignedId.$Shape; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "publicKey"; signedId?: null; publicKey: hbb.PublicKey.$Shape; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "testDelay"; signedId?: null; publicKey?: null; testDelay: hbb.TestDelay.$Shape; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "videoFrame"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame: hbb.VideoFrame.$Shape; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "loginRequest"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest: hbb.LoginRequest.$Shape; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "loginResponse"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse: hbb.LoginResponse.$Shape; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "hash"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash: hbb.Hash.$Shape; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "mouseEvent"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent: hbb.MouseEvent.$Shape; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "audioFrame"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame: hbb.AudioFrame.$Shape; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "cursorData"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData: hbb.CursorData.$Shape; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "cursorPosition"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition: hbb.CursorPosition.$Shape; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "cursorId"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId: number|Long; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "keyEvent"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent: hbb.KeyEvent.$Shape; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "clipboard"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard: hbb.Clipboard.$Shape; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "fileAction"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction: hbb.FileAction.$Shape; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "fileResponse"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse: hbb.FileResponse.$Shape; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "misc"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc: hbb.Misc.$Shape; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "cliprdr"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr: hbb.Cliprdr.$Shape; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "messageBox"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox: hbb.MessageBox.$Shape; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "switchSidesResponse"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse: hbb.SwitchSidesResponse.$Shape; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "voiceCallRequest"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest: hbb.VoiceCallRequest.$Shape; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "voiceCallResponse"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse: hbb.VoiceCallResponse.$Shape; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "peerInfo"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo: hbb.PeerInfo.$Shape; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "pointerDeviceEvent"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent: hbb.PointerDeviceEvent.$Shape; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "auth_2fa"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa: hbb.Auth2FA.$Shape; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "multiClipboards"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards: hbb.MultiClipboards.$Shape; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "screenshotRequest"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest: hbb.ScreenshotRequest.$Shape; screenshotResponse?: null; terminalAction?: null; terminalResponse?: null }|{ union?: "screenshotResponse"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse: hbb.ScreenshotResponse.$Shape; terminalAction?: null; terminalResponse?: null }|{ union?: "terminalAction"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction: hbb.TerminalAction.$Shape; terminalResponse?: null }|{ union?: "terminalResponse"; signedId?: null; publicKey?: null; testDelay?: null; videoFrame?: null; loginRequest?: null; loginResponse?: null; hash?: null; mouseEvent?: null; audioFrame?: null; cursorData?: null; cursorPosition?: null; cursorId?: null; keyEvent?: null; clipboard?: null; fileAction?: null; fileResponse?: null; misc?: null; cliprdr?: null; messageBox?: null; switchSidesResponse?: null; voiceCallRequest?: null; voiceCallResponse?: null; peerInfo?: null; pointerDeviceEvent?: null; auth_2fa?: null; multiClipboards?: null; screenshotRequest?: null; screenshotResponse?: null; terminalAction?: null; terminalResponse: hbb.TerminalResponse.$Shape })
        );
    }
}
