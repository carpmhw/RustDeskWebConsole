// Generated from rustdesk/hbb_common 334641686c731631fc51524bb2aa2ec2773069ee; AGPL-3.0, RustDesk contributors. Do not edit.
// rendezvous.proto SHA256 98c7c047761bbd7151b72d249f9e58479cc345827335589a1f5285c27ab1a469; message.proto SHA256 963cb7b27752edf7c200f563607fdbef76e1792951cbb4bb21d72508435f08eb.
import * as $protobuf from "protobufjs";
import Long = require("long");

/** Namespace hbb. */
export namespace hbb {

    /**
     * Properties of a RegisterPeer.
     * @deprecated Use hbb.RegisterPeer.$Properties instead.
     */
    interface IRegisterPeer extends hbb.RegisterPeer.$Properties {
    }

    /** Represents a RegisterPeer. */
    class RegisterPeer {

        /**
         * Constructs a new RegisterPeer.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RegisterPeer.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RegisterPeer id. */
        id: string;

        /** RegisterPeer serial. */
        serial: number;

        /**
         * Creates a new RegisterPeer instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RegisterPeer instance
         */
        static create(properties: hbb.RegisterPeer.$Shape): hbb.RegisterPeer & hbb.RegisterPeer.$Shape;
        static create(properties?: hbb.RegisterPeer.$Properties): hbb.RegisterPeer;

        /**
         * Encodes the specified RegisterPeer message. Does not implicitly {@link hbb.RegisterPeer.verify|verify} messages.
         * @param message RegisterPeer message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RegisterPeer.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RegisterPeer message, length delimited. Does not implicitly {@link hbb.RegisterPeer.verify|verify} messages.
         * @param message RegisterPeer message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RegisterPeer.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RegisterPeer message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RegisterPeer & hbb.RegisterPeer.$Shape} RegisterPeer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RegisterPeer & hbb.RegisterPeer.$Shape;

        /**
         * Decodes a RegisterPeer message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RegisterPeer & hbb.RegisterPeer.$Shape} RegisterPeer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RegisterPeer & hbb.RegisterPeer.$Shape;

        /**
         * Verifies a RegisterPeer message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RegisterPeer message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RegisterPeer
         */
        static fromObject(object: { [k: string]: any }): hbb.RegisterPeer;

        /**
         * Creates a plain object from a RegisterPeer message. Also converts values to other types if specified.
         * @param message RegisterPeer
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RegisterPeer, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RegisterPeer to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RegisterPeer
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RegisterPeer {

        /** Properties of a RegisterPeer. */
        interface $Properties {

            /** RegisterPeer id */
            id?: (string|null);

            /** RegisterPeer serial */
            serial?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a RegisterPeer. */
        type $Shape = hbb.RegisterPeer.$Properties;
    }

    /** ConnType enum. */
    enum ConnType {

        /** DEFAULT_CONN value */
        DEFAULT_CONN = 0,

        /** FILE_TRANSFER value */
        FILE_TRANSFER = 1,

        /** PORT_FORWARD value */
        PORT_FORWARD = 2,

        /** RDP value */
        RDP = 3,

        /** VIEW_CAMERA value */
        VIEW_CAMERA = 4,

        /** TERMINAL value */
        TERMINAL = 5
    }

    /**
     * Properties of a RegisterPeerResponse.
     * @deprecated Use hbb.RegisterPeerResponse.$Properties instead.
     */
    interface IRegisterPeerResponse extends hbb.RegisterPeerResponse.$Properties {
    }

    /** Represents a RegisterPeerResponse. */
    class RegisterPeerResponse {

        /**
         * Constructs a new RegisterPeerResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RegisterPeerResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RegisterPeerResponse requestPk. */
        requestPk: boolean;

        /**
         * Creates a new RegisterPeerResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RegisterPeerResponse instance
         */
        static create(properties: hbb.RegisterPeerResponse.$Shape): hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape;
        static create(properties?: hbb.RegisterPeerResponse.$Properties): hbb.RegisterPeerResponse;

        /**
         * Encodes the specified RegisterPeerResponse message. Does not implicitly {@link hbb.RegisterPeerResponse.verify|verify} messages.
         * @param message RegisterPeerResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RegisterPeerResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RegisterPeerResponse message, length delimited. Does not implicitly {@link hbb.RegisterPeerResponse.verify|verify} messages.
         * @param message RegisterPeerResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RegisterPeerResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RegisterPeerResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape} RegisterPeerResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape;

        /**
         * Decodes a RegisterPeerResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape} RegisterPeerResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape;

        /**
         * Verifies a RegisterPeerResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RegisterPeerResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RegisterPeerResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.RegisterPeerResponse;

        /**
         * Creates a plain object from a RegisterPeerResponse message. Also converts values to other types if specified.
         * @param message RegisterPeerResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RegisterPeerResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RegisterPeerResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RegisterPeerResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RegisterPeerResponse {

        /** Properties of a RegisterPeerResponse. */
        interface $Properties {

            /** RegisterPeerResponse requestPk */
            requestPk?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a RegisterPeerResponse. */
        type $Shape = hbb.RegisterPeerResponse.$Properties;
    }

    /**
     * Properties of a PunchHoleRequest.
     * @deprecated Use hbb.PunchHoleRequest.$Properties instead.
     */
    interface IPunchHoleRequest extends hbb.PunchHoleRequest.$Properties {
    }

    /** Represents a PunchHoleRequest. */
    class PunchHoleRequest {

        /**
         * Constructs a new PunchHoleRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PunchHoleRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PunchHoleRequest id. */
        id: string;

        /** PunchHoleRequest natType. */
        natType: hbb.NatType;

        /** PunchHoleRequest licenceKey. */
        licenceKey: string;

        /** PunchHoleRequest connType. */
        connType: hbb.ConnType;

        /** PunchHoleRequest token. */
        token: string;

        /** PunchHoleRequest version. */
        version: string;

        /** PunchHoleRequest udpPort. */
        udpPort: number;

        /** PunchHoleRequest forceRelay. */
        forceRelay: boolean;

        /** PunchHoleRequest upnpPort. */
        upnpPort: number;

        /** PunchHoleRequest socketAddrV6. */
        socketAddrV6: Uint8Array;

        /**
         * Creates a new PunchHoleRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PunchHoleRequest instance
         */
        static create(properties: hbb.PunchHoleRequest.$Shape): hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape;
        static create(properties?: hbb.PunchHoleRequest.$Properties): hbb.PunchHoleRequest;

        /**
         * Encodes the specified PunchHoleRequest message. Does not implicitly {@link hbb.PunchHoleRequest.verify|verify} messages.
         * @param message PunchHoleRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PunchHoleRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PunchHoleRequest message, length delimited. Does not implicitly {@link hbb.PunchHoleRequest.verify|verify} messages.
         * @param message PunchHoleRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PunchHoleRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PunchHoleRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape} PunchHoleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape;

        /**
         * Decodes a PunchHoleRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape} PunchHoleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape;

        /**
         * Verifies a PunchHoleRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PunchHoleRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PunchHoleRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.PunchHoleRequest;

        /**
         * Creates a plain object from a PunchHoleRequest message. Also converts values to other types if specified.
         * @param message PunchHoleRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PunchHoleRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PunchHoleRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PunchHoleRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PunchHoleRequest {

        /** Properties of a PunchHoleRequest. */
        interface $Properties {

            /** PunchHoleRequest id */
            id?: (string|null);

            /** PunchHoleRequest natType */
            natType?: (hbb.NatType|null);

            /** PunchHoleRequest licenceKey */
            licenceKey?: (string|null);

            /** PunchHoleRequest connType */
            connType?: (hbb.ConnType|null);

            /** PunchHoleRequest token */
            token?: (string|null);

            /** PunchHoleRequest version */
            version?: (string|null);

            /** PunchHoleRequest udpPort */
            udpPort?: (number|null);

            /** PunchHoleRequest forceRelay */
            forceRelay?: (boolean|null);

            /** PunchHoleRequest upnpPort */
            upnpPort?: (number|null);

            /** PunchHoleRequest socketAddrV6 */
            socketAddrV6?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PunchHoleRequest. */
        type $Shape = hbb.PunchHoleRequest.$Properties;
    }

    /**
     * Properties of a PunchHole.
     * @deprecated Use hbb.PunchHole.$Properties instead.
     */
    interface IPunchHole extends hbb.PunchHole.$Properties {
    }

    /** Represents a PunchHole. */
    class PunchHole {

        /**
         * Constructs a new PunchHole.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PunchHole.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PunchHole socketAddr. */
        socketAddr: Uint8Array;

        /** PunchHole relayServer. */
        relayServer: string;

        /** PunchHole natType. */
        natType: hbb.NatType;

        /** PunchHole udpPort. */
        udpPort: number;

        /** PunchHole forceRelay. */
        forceRelay: boolean;

        /** PunchHole upnpPort. */
        upnpPort: number;

        /** PunchHole socketAddrV6. */
        socketAddrV6: Uint8Array;

        /**
         * Creates a new PunchHole instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PunchHole instance
         */
        static create(properties: hbb.PunchHole.$Shape): hbb.PunchHole & hbb.PunchHole.$Shape;
        static create(properties?: hbb.PunchHole.$Properties): hbb.PunchHole;

        /**
         * Encodes the specified PunchHole message. Does not implicitly {@link hbb.PunchHole.verify|verify} messages.
         * @param message PunchHole message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PunchHole.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PunchHole message, length delimited. Does not implicitly {@link hbb.PunchHole.verify|verify} messages.
         * @param message PunchHole message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PunchHole.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PunchHole message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PunchHole & hbb.PunchHole.$Shape} PunchHole
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PunchHole & hbb.PunchHole.$Shape;

        /**
         * Decodes a PunchHole message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PunchHole & hbb.PunchHole.$Shape} PunchHole
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PunchHole & hbb.PunchHole.$Shape;

        /**
         * Verifies a PunchHole message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PunchHole message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PunchHole
         */
        static fromObject(object: { [k: string]: any }): hbb.PunchHole;

        /**
         * Creates a plain object from a PunchHole message. Also converts values to other types if specified.
         * @param message PunchHole
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PunchHole, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PunchHole to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PunchHole
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PunchHole {

        /** Properties of a PunchHole. */
        interface $Properties {

            /** PunchHole socketAddr */
            socketAddr?: (Uint8Array|null);

            /** PunchHole relayServer */
            relayServer?: (string|null);

            /** PunchHole natType */
            natType?: (hbb.NatType|null);

            /** PunchHole udpPort */
            udpPort?: (number|null);

            /** PunchHole forceRelay */
            forceRelay?: (boolean|null);

            /** PunchHole upnpPort */
            upnpPort?: (number|null);

            /** PunchHole socketAddrV6 */
            socketAddrV6?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PunchHole. */
        type $Shape = hbb.PunchHole.$Properties;
    }

    /**
     * Properties of a TestNatRequest.
     * @deprecated Use hbb.TestNatRequest.$Properties instead.
     */
    interface ITestNatRequest extends hbb.TestNatRequest.$Properties {
    }

    /** Represents a TestNatRequest. */
    class TestNatRequest {

        /**
         * Constructs a new TestNatRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TestNatRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TestNatRequest serial. */
        serial: number;

        /**
         * Creates a new TestNatRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TestNatRequest instance
         */
        static create(properties: hbb.TestNatRequest.$Shape): hbb.TestNatRequest & hbb.TestNatRequest.$Shape;
        static create(properties?: hbb.TestNatRequest.$Properties): hbb.TestNatRequest;

        /**
         * Encodes the specified TestNatRequest message. Does not implicitly {@link hbb.TestNatRequest.verify|verify} messages.
         * @param message TestNatRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TestNatRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TestNatRequest message, length delimited. Does not implicitly {@link hbb.TestNatRequest.verify|verify} messages.
         * @param message TestNatRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TestNatRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TestNatRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TestNatRequest & hbb.TestNatRequest.$Shape} TestNatRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TestNatRequest & hbb.TestNatRequest.$Shape;

        /**
         * Decodes a TestNatRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TestNatRequest & hbb.TestNatRequest.$Shape} TestNatRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TestNatRequest & hbb.TestNatRequest.$Shape;

        /**
         * Verifies a TestNatRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TestNatRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TestNatRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.TestNatRequest;

        /**
         * Creates a plain object from a TestNatRequest message. Also converts values to other types if specified.
         * @param message TestNatRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TestNatRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TestNatRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TestNatRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TestNatRequest {

        /** Properties of a TestNatRequest. */
        interface $Properties {

            /** TestNatRequest serial */
            serial?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TestNatRequest. */
        type $Shape = hbb.TestNatRequest.$Properties;
    }

    /**
     * Properties of a TestNatResponse.
     * @deprecated Use hbb.TestNatResponse.$Properties instead.
     */
    interface ITestNatResponse extends hbb.TestNatResponse.$Properties {
    }

    /** Represents a TestNatResponse. */
    class TestNatResponse {

        /**
         * Constructs a new TestNatResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.TestNatResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** TestNatResponse port. */
        port: number;

        /** TestNatResponse cu. */
        cu?: (hbb.ConfigUpdate.$Properties|null);

        /**
         * Creates a new TestNatResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns TestNatResponse instance
         */
        static create(properties: hbb.TestNatResponse.$Shape): hbb.TestNatResponse & hbb.TestNatResponse.$Shape;
        static create(properties?: hbb.TestNatResponse.$Properties): hbb.TestNatResponse;

        /**
         * Encodes the specified TestNatResponse message. Does not implicitly {@link hbb.TestNatResponse.verify|verify} messages.
         * @param message TestNatResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.TestNatResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TestNatResponse message, length delimited. Does not implicitly {@link hbb.TestNatResponse.verify|verify} messages.
         * @param message TestNatResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.TestNatResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TestNatResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.TestNatResponse & hbb.TestNatResponse.$Shape} TestNatResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.TestNatResponse & hbb.TestNatResponse.$Shape;

        /**
         * Decodes a TestNatResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.TestNatResponse & hbb.TestNatResponse.$Shape} TestNatResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.TestNatResponse & hbb.TestNatResponse.$Shape;

        /**
         * Verifies a TestNatResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a TestNatResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns TestNatResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.TestNatResponse;

        /**
         * Creates a plain object from a TestNatResponse message. Also converts values to other types if specified.
         * @param message TestNatResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.TestNatResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this TestNatResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for TestNatResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace TestNatResponse {

        /** Properties of a TestNatResponse. */
        interface $Properties {

            /** TestNatResponse port */
            port?: (number|null);

            /** TestNatResponse cu */
            cu?: (hbb.ConfigUpdate.$Properties|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a TestNatResponse. */
        type $Shape = hbb.TestNatResponse.$Properties;
    }

    /** NatType enum. */
    enum NatType {

        /** UNKNOWN_NAT value */
        UNKNOWN_NAT = 0,

        /** ASYMMETRIC value */
        ASYMMETRIC = 1,

        /** SYMMETRIC value */
        SYMMETRIC = 2
    }

    /**
     * Properties of a PunchHoleSent.
     * @deprecated Use hbb.PunchHoleSent.$Properties instead.
     */
    interface IPunchHoleSent extends hbb.PunchHoleSent.$Properties {
    }

    /** Represents a PunchHoleSent. */
    class PunchHoleSent {

        /**
         * Constructs a new PunchHoleSent.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PunchHoleSent.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PunchHoleSent socketAddr. */
        socketAddr: Uint8Array;

        /** PunchHoleSent id. */
        id: string;

        /** PunchHoleSent relayServer. */
        relayServer: string;

        /** PunchHoleSent natType. */
        natType: hbb.NatType;

        /** PunchHoleSent version. */
        version: string;

        /** PunchHoleSent upnpPort. */
        upnpPort: number;

        /** PunchHoleSent socketAddrV6. */
        socketAddrV6: Uint8Array;

        /**
         * Creates a new PunchHoleSent instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PunchHoleSent instance
         */
        static create(properties: hbb.PunchHoleSent.$Shape): hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape;
        static create(properties?: hbb.PunchHoleSent.$Properties): hbb.PunchHoleSent;

        /**
         * Encodes the specified PunchHoleSent message. Does not implicitly {@link hbb.PunchHoleSent.verify|verify} messages.
         * @param message PunchHoleSent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PunchHoleSent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PunchHoleSent message, length delimited. Does not implicitly {@link hbb.PunchHoleSent.verify|verify} messages.
         * @param message PunchHoleSent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PunchHoleSent.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PunchHoleSent message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape} PunchHoleSent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape;

        /**
         * Decodes a PunchHoleSent message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape} PunchHoleSent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape;

        /**
         * Verifies a PunchHoleSent message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PunchHoleSent message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PunchHoleSent
         */
        static fromObject(object: { [k: string]: any }): hbb.PunchHoleSent;

        /**
         * Creates a plain object from a PunchHoleSent message. Also converts values to other types if specified.
         * @param message PunchHoleSent
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PunchHoleSent, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PunchHoleSent to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PunchHoleSent
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PunchHoleSent {

        /** Properties of a PunchHoleSent. */
        interface $Properties {

            /** PunchHoleSent socketAddr */
            socketAddr?: (Uint8Array|null);

            /** PunchHoleSent id */
            id?: (string|null);

            /** PunchHoleSent relayServer */
            relayServer?: (string|null);

            /** PunchHoleSent natType */
            natType?: (hbb.NatType|null);

            /** PunchHoleSent version */
            version?: (string|null);

            /** PunchHoleSent upnpPort */
            upnpPort?: (number|null);

            /** PunchHoleSent socketAddrV6 */
            socketAddrV6?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PunchHoleSent. */
        type $Shape = hbb.PunchHoleSent.$Properties;
    }

    /**
     * Properties of a RegisterPk.
     * @deprecated Use hbb.RegisterPk.$Properties instead.
     */
    interface IRegisterPk extends hbb.RegisterPk.$Properties {
    }

    /** Represents a RegisterPk. */
    class RegisterPk {

        /**
         * Constructs a new RegisterPk.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RegisterPk.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RegisterPk id. */
        id: string;

        /** RegisterPk uuid. */
        uuid: Uint8Array;

        /** RegisterPk pk. */
        pk: Uint8Array;

        /** RegisterPk oldId. */
        oldId: string;

        /** RegisterPk noRegisterDevice. */
        noRegisterDevice: boolean;

        /**
         * Creates a new RegisterPk instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RegisterPk instance
         */
        static create(properties: hbb.RegisterPk.$Shape): hbb.RegisterPk & hbb.RegisterPk.$Shape;
        static create(properties?: hbb.RegisterPk.$Properties): hbb.RegisterPk;

        /**
         * Encodes the specified RegisterPk message. Does not implicitly {@link hbb.RegisterPk.verify|verify} messages.
         * @param message RegisterPk message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RegisterPk.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RegisterPk message, length delimited. Does not implicitly {@link hbb.RegisterPk.verify|verify} messages.
         * @param message RegisterPk message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RegisterPk.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RegisterPk message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RegisterPk & hbb.RegisterPk.$Shape} RegisterPk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RegisterPk & hbb.RegisterPk.$Shape;

        /**
         * Decodes a RegisterPk message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RegisterPk & hbb.RegisterPk.$Shape} RegisterPk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RegisterPk & hbb.RegisterPk.$Shape;

        /**
         * Verifies a RegisterPk message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RegisterPk message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RegisterPk
         */
        static fromObject(object: { [k: string]: any }): hbb.RegisterPk;

        /**
         * Creates a plain object from a RegisterPk message. Also converts values to other types if specified.
         * @param message RegisterPk
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RegisterPk, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RegisterPk to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RegisterPk
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RegisterPk {

        /** Properties of a RegisterPk. */
        interface $Properties {

            /** RegisterPk id */
            id?: (string|null);

            /** RegisterPk uuid */
            uuid?: (Uint8Array|null);

            /** RegisterPk pk */
            pk?: (Uint8Array|null);

            /** RegisterPk oldId */
            oldId?: (string|null);

            /** RegisterPk noRegisterDevice */
            noRegisterDevice?: (boolean|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a RegisterPk. */
        type $Shape = hbb.RegisterPk.$Properties;
    }

    /**
     * Properties of a RegisterPkResponse.
     * @deprecated Use hbb.RegisterPkResponse.$Properties instead.
     */
    interface IRegisterPkResponse extends hbb.RegisterPkResponse.$Properties {
    }

    /** Represents a RegisterPkResponse. */
    class RegisterPkResponse {

        /**
         * Constructs a new RegisterPkResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RegisterPkResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RegisterPkResponse result. */
        result: hbb.RegisterPkResponse.Result;

        /** RegisterPkResponse keepAlive. */
        keepAlive: number;

        /**
         * Creates a new RegisterPkResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RegisterPkResponse instance
         */
        static create(properties: hbb.RegisterPkResponse.$Shape): hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape;
        static create(properties?: hbb.RegisterPkResponse.$Properties): hbb.RegisterPkResponse;

        /**
         * Encodes the specified RegisterPkResponse message. Does not implicitly {@link hbb.RegisterPkResponse.verify|verify} messages.
         * @param message RegisterPkResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RegisterPkResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RegisterPkResponse message, length delimited. Does not implicitly {@link hbb.RegisterPkResponse.verify|verify} messages.
         * @param message RegisterPkResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RegisterPkResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RegisterPkResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape} RegisterPkResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape;

        /**
         * Decodes a RegisterPkResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape} RegisterPkResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape;

        /**
         * Verifies a RegisterPkResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RegisterPkResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RegisterPkResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.RegisterPkResponse;

        /**
         * Creates a plain object from a RegisterPkResponse message. Also converts values to other types if specified.
         * @param message RegisterPkResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RegisterPkResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RegisterPkResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RegisterPkResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RegisterPkResponse {

        /** Properties of a RegisterPkResponse. */
        interface $Properties {

            /** RegisterPkResponse result */
            result?: (hbb.RegisterPkResponse.Result|null);

            /** RegisterPkResponse keepAlive */
            keepAlive?: (number|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a RegisterPkResponse. */
        type $Shape = hbb.RegisterPkResponse.$Properties;

        /** Result enum. */
        enum Result {

            /** OK value */
            OK = 0,

            /** UUID_MISMATCH value */
            UUID_MISMATCH = 2,

            /** ID_EXISTS value */
            ID_EXISTS = 3,

            /** TOO_FREQUENT value */
            TOO_FREQUENT = 4,

            /** INVALID_ID_FORMAT value */
            INVALID_ID_FORMAT = 5,

            /** NOT_SUPPORT value */
            NOT_SUPPORT = 6,

            /** SERVER_ERROR value */
            SERVER_ERROR = 7
        }
    }

    /**
     * Properties of a PunchHoleResponse.
     * @deprecated Use hbb.PunchHoleResponse.$Properties instead.
     */
    interface IPunchHoleResponse extends hbb.PunchHoleResponse.$Properties {
    }

    /** Represents a PunchHoleResponse. */
    class PunchHoleResponse {

        /**
         * Constructs a new PunchHoleResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PunchHoleResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PunchHoleResponse socketAddr. */
        socketAddr: Uint8Array;

        /** PunchHoleResponse pk. */
        pk: Uint8Array;

        /** PunchHoleResponse failure. */
        failure: hbb.PunchHoleResponse.Failure;

        /** PunchHoleResponse relayServer. */
        relayServer: string;

        /** PunchHoleResponse natType. */
        natType?: (hbb.NatType|null);

        /** PunchHoleResponse isLocal. */
        isLocal?: (boolean|null);

        /** PunchHoleResponse otherFailure. */
        otherFailure: string;

        /** PunchHoleResponse feedback. */
        feedback: number;

        /** PunchHoleResponse isUdp. */
        isUdp: boolean;

        /** PunchHoleResponse upnpPort. */
        upnpPort: number;

        /** PunchHoleResponse socketAddrV6. */
        socketAddrV6: Uint8Array;

        /** PunchHoleResponse union. */
        union?: ("natType"|"isLocal");

        /**
         * Creates a new PunchHoleResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PunchHoleResponse instance
         */
        static create(properties: hbb.PunchHoleResponse.$Shape): hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape;
        static create(properties?: hbb.PunchHoleResponse.$Properties): hbb.PunchHoleResponse;

        /**
         * Encodes the specified PunchHoleResponse message. Does not implicitly {@link hbb.PunchHoleResponse.verify|verify} messages.
         * @param message PunchHoleResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PunchHoleResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PunchHoleResponse message, length delimited. Does not implicitly {@link hbb.PunchHoleResponse.verify|verify} messages.
         * @param message PunchHoleResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PunchHoleResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PunchHoleResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape} PunchHoleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape;

        /**
         * Decodes a PunchHoleResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape} PunchHoleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape;

        /**
         * Verifies a PunchHoleResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PunchHoleResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PunchHoleResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.PunchHoleResponse;

        /**
         * Creates a plain object from a PunchHoleResponse message. Also converts values to other types if specified.
         * @param message PunchHoleResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PunchHoleResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PunchHoleResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PunchHoleResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PunchHoleResponse {

        /** Properties of a PunchHoleResponse. */
        interface $Properties {

            /** PunchHoleResponse socketAddr */
            socketAddr?: (Uint8Array|null);

            /** PunchHoleResponse pk */
            pk?: (Uint8Array|null);

            /** PunchHoleResponse failure */
            failure?: (hbb.PunchHoleResponse.Failure|null);

            /** PunchHoleResponse relayServer */
            relayServer?: (string|null);

            /** PunchHoleResponse natType */
            natType?: (hbb.NatType|null);

            /** PunchHoleResponse isLocal */
            isLocal?: (boolean|null);

            /** PunchHoleResponse otherFailure */
            otherFailure?: (string|null);

            /** PunchHoleResponse feedback */
            feedback?: (number|null);

            /** PunchHoleResponse isUdp */
            isUdp?: (boolean|null);

            /** PunchHoleResponse upnpPort */
            upnpPort?: (number|null);

            /** PunchHoleResponse socketAddrV6 */
            socketAddrV6?: (Uint8Array|null);

            /** PunchHoleResponse union */
            union?: ("natType"|"isLocal");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a PunchHoleResponse. */
        type $Shape = {
          socketAddr?: Uint8Array|null;
          pk?: Uint8Array|null;
          failure?: hbb.PunchHoleResponse.Failure|null;
          relayServer?: string|null;
          natType?: hbb.NatType|null;
          isLocal?: boolean|null;
          otherFailure?: string|null;
          feedback?: number|null;
          isUdp?: boolean|null;
          upnpPort?: number|null;
          socketAddrV6?: Uint8Array|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; natType?: null; isLocal?: null }|{ union?: "natType"; natType: hbb.NatType; isLocal?: null }|{ union?: "isLocal"; natType?: null; isLocal: boolean })
        );

        /** Failure enum. */
        enum Failure {

            /** ID_NOT_EXIST value */
            ID_NOT_EXIST = 0,

            /** OFFLINE value */
            OFFLINE = 2,

            /** LICENSE_MISMATCH value */
            LICENSE_MISMATCH = 3,

            /** LICENSE_OVERUSE value */
            LICENSE_OVERUSE = 4
        }
    }

    /**
     * Properties of a ConfigUpdate.
     * @deprecated Use hbb.ConfigUpdate.$Properties instead.
     */
    interface IConfigUpdate extends hbb.ConfigUpdate.$Properties {
    }

    /** Represents a ConfigUpdate. */
    class ConfigUpdate {

        /**
         * Constructs a new ConfigUpdate.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.ConfigUpdate.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** ConfigUpdate serial. */
        serial: number;

        /** ConfigUpdate rendezvousServers. */
        rendezvousServers: string[];

        /**
         * Creates a new ConfigUpdate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ConfigUpdate instance
         */
        static create(properties: hbb.ConfigUpdate.$Shape): hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape;
        static create(properties?: hbb.ConfigUpdate.$Properties): hbb.ConfigUpdate;

        /**
         * Encodes the specified ConfigUpdate message. Does not implicitly {@link hbb.ConfigUpdate.verify|verify} messages.
         * @param message ConfigUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.ConfigUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ConfigUpdate message, length delimited. Does not implicitly {@link hbb.ConfigUpdate.verify|verify} messages.
         * @param message ConfigUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.ConfigUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ConfigUpdate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape} ConfigUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape;

        /**
         * Decodes a ConfigUpdate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape} ConfigUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape;

        /**
         * Verifies a ConfigUpdate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ConfigUpdate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ConfigUpdate
         */
        static fromObject(object: { [k: string]: any }): hbb.ConfigUpdate;

        /**
         * Creates a plain object from a ConfigUpdate message. Also converts values to other types if specified.
         * @param message ConfigUpdate
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.ConfigUpdate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ConfigUpdate to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for ConfigUpdate
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace ConfigUpdate {

        /** Properties of a ConfigUpdate. */
        interface $Properties {

            /** ConfigUpdate serial */
            serial?: (number|null);

            /** ConfigUpdate rendezvousServers */
            rendezvousServers?: (string[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a ConfigUpdate. */
        type $Shape = hbb.ConfigUpdate.$Properties;
    }

    /**
     * Properties of a RequestRelay.
     * @deprecated Use hbb.RequestRelay.$Properties instead.
     */
    interface IRequestRelay extends hbb.RequestRelay.$Properties {
    }

    /** Represents a RequestRelay. */
    class RequestRelay {

        /**
         * Constructs a new RequestRelay.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RequestRelay.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RequestRelay id. */
        id: string;

        /** RequestRelay uuid. */
        uuid: string;

        /** RequestRelay socketAddr. */
        socketAddr: Uint8Array;

        /** RequestRelay relayServer. */
        relayServer: string;

        /** RequestRelay secure. */
        secure: boolean;

        /** RequestRelay licenceKey. */
        licenceKey: string;

        /** RequestRelay connType. */
        connType: hbb.ConnType;

        /** RequestRelay token. */
        token: string;

        /**
         * Creates a new RequestRelay instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RequestRelay instance
         */
        static create(properties: hbb.RequestRelay.$Shape): hbb.RequestRelay & hbb.RequestRelay.$Shape;
        static create(properties?: hbb.RequestRelay.$Properties): hbb.RequestRelay;

        /**
         * Encodes the specified RequestRelay message. Does not implicitly {@link hbb.RequestRelay.verify|verify} messages.
         * @param message RequestRelay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RequestRelay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RequestRelay message, length delimited. Does not implicitly {@link hbb.RequestRelay.verify|verify} messages.
         * @param message RequestRelay message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RequestRelay.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RequestRelay message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RequestRelay & hbb.RequestRelay.$Shape} RequestRelay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RequestRelay & hbb.RequestRelay.$Shape;

        /**
         * Decodes a RequestRelay message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RequestRelay & hbb.RequestRelay.$Shape} RequestRelay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RequestRelay & hbb.RequestRelay.$Shape;

        /**
         * Verifies a RequestRelay message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RequestRelay message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RequestRelay
         */
        static fromObject(object: { [k: string]: any }): hbb.RequestRelay;

        /**
         * Creates a plain object from a RequestRelay message. Also converts values to other types if specified.
         * @param message RequestRelay
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RequestRelay, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RequestRelay to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RequestRelay
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RequestRelay {

        /** Properties of a RequestRelay. */
        interface $Properties {

            /** RequestRelay id */
            id?: (string|null);

            /** RequestRelay uuid */
            uuid?: (string|null);

            /** RequestRelay socketAddr */
            socketAddr?: (Uint8Array|null);

            /** RequestRelay relayServer */
            relayServer?: (string|null);

            /** RequestRelay secure */
            secure?: (boolean|null);

            /** RequestRelay licenceKey */
            licenceKey?: (string|null);

            /** RequestRelay connType */
            connType?: (hbb.ConnType|null);

            /** RequestRelay token */
            token?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a RequestRelay. */
        type $Shape = hbb.RequestRelay.$Properties;
    }

    /**
     * Properties of a RelayResponse.
     * @deprecated Use hbb.RelayResponse.$Properties instead.
     */
    interface IRelayResponse extends hbb.RelayResponse.$Properties {
    }

    /** Represents a RelayResponse. */
    class RelayResponse {

        /**
         * Constructs a new RelayResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RelayResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RelayResponse socketAddr. */
        socketAddr: Uint8Array;

        /** RelayResponse uuid. */
        uuid: string;

        /** RelayResponse relayServer. */
        relayServer: string;

        /** RelayResponse id. */
        id?: (string|null);

        /** RelayResponse pk. */
        pk?: (Uint8Array|null);

        /** RelayResponse refuseReason. */
        refuseReason: string;

        /** RelayResponse version. */
        version: string;

        /** RelayResponse feedback. */
        feedback: number;

        /** RelayResponse socketAddrV6. */
        socketAddrV6: Uint8Array;

        /** RelayResponse upnpPort. */
        upnpPort: number;

        /** RelayResponse union. */
        union?: ("id"|"pk");

        /**
         * Creates a new RelayResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RelayResponse instance
         */
        static create(properties: hbb.RelayResponse.$Shape): hbb.RelayResponse & hbb.RelayResponse.$Shape;
        static create(properties?: hbb.RelayResponse.$Properties): hbb.RelayResponse;

        /**
         * Encodes the specified RelayResponse message. Does not implicitly {@link hbb.RelayResponse.verify|verify} messages.
         * @param message RelayResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RelayResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RelayResponse message, length delimited. Does not implicitly {@link hbb.RelayResponse.verify|verify} messages.
         * @param message RelayResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RelayResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RelayResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RelayResponse & hbb.RelayResponse.$Shape} RelayResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RelayResponse & hbb.RelayResponse.$Shape;

        /**
         * Decodes a RelayResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RelayResponse & hbb.RelayResponse.$Shape} RelayResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RelayResponse & hbb.RelayResponse.$Shape;

        /**
         * Verifies a RelayResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RelayResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RelayResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.RelayResponse;

        /**
         * Creates a plain object from a RelayResponse message. Also converts values to other types if specified.
         * @param message RelayResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RelayResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RelayResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RelayResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RelayResponse {

        /** Properties of a RelayResponse. */
        interface $Properties {

            /** RelayResponse socketAddr */
            socketAddr?: (Uint8Array|null);

            /** RelayResponse uuid */
            uuid?: (string|null);

            /** RelayResponse relayServer */
            relayServer?: (string|null);

            /** RelayResponse id */
            id?: (string|null);

            /** RelayResponse pk */
            pk?: (Uint8Array|null);

            /** RelayResponse refuseReason */
            refuseReason?: (string|null);

            /** RelayResponse version */
            version?: (string|null);

            /** RelayResponse feedback */
            feedback?: (number|null);

            /** RelayResponse socketAddrV6 */
            socketAddrV6?: (Uint8Array|null);

            /** RelayResponse upnpPort */
            upnpPort?: (number|null);

            /** RelayResponse union */
            union?: ("id"|"pk");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a RelayResponse. */
        type $Shape = {
          socketAddr?: Uint8Array|null;
          uuid?: string|null;
          relayServer?: string|null;
          id?: string|null;
          pk?: Uint8Array|null;
          refuseReason?: string|null;
          version?: string|null;
          feedback?: number|null;
          socketAddrV6?: Uint8Array|null;
          upnpPort?: number|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; id?: null; pk?: null }|{ union?: "id"; id: string; pk?: null }|{ union?: "pk"; id?: null; pk: Uint8Array })
        );
    }

    /**
     * Properties of a SoftwareUpdate.
     * @deprecated Use hbb.SoftwareUpdate.$Properties instead.
     */
    interface ISoftwareUpdate extends hbb.SoftwareUpdate.$Properties {
    }

    /** Represents a SoftwareUpdate. */
    class SoftwareUpdate {

        /**
         * Constructs a new SoftwareUpdate.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.SoftwareUpdate.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** SoftwareUpdate url. */
        url: string;

        /**
         * Creates a new SoftwareUpdate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SoftwareUpdate instance
         */
        static create(properties: hbb.SoftwareUpdate.$Shape): hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape;
        static create(properties?: hbb.SoftwareUpdate.$Properties): hbb.SoftwareUpdate;

        /**
         * Encodes the specified SoftwareUpdate message. Does not implicitly {@link hbb.SoftwareUpdate.verify|verify} messages.
         * @param message SoftwareUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.SoftwareUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SoftwareUpdate message, length delimited. Does not implicitly {@link hbb.SoftwareUpdate.verify|verify} messages.
         * @param message SoftwareUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.SoftwareUpdate.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SoftwareUpdate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape} SoftwareUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape;

        /**
         * Decodes a SoftwareUpdate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape} SoftwareUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape;

        /**
         * Verifies a SoftwareUpdate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SoftwareUpdate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SoftwareUpdate
         */
        static fromObject(object: { [k: string]: any }): hbb.SoftwareUpdate;

        /**
         * Creates a plain object from a SoftwareUpdate message. Also converts values to other types if specified.
         * @param message SoftwareUpdate
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.SoftwareUpdate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SoftwareUpdate to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for SoftwareUpdate
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace SoftwareUpdate {

        /** Properties of a SoftwareUpdate. */
        interface $Properties {

            /** SoftwareUpdate url */
            url?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a SoftwareUpdate. */
        type $Shape = hbb.SoftwareUpdate.$Properties;
    }

    /**
     * Properties of a FetchLocalAddr.
     * @deprecated Use hbb.FetchLocalAddr.$Properties instead.
     */
    interface IFetchLocalAddr extends hbb.FetchLocalAddr.$Properties {
    }

    /** Represents a FetchLocalAddr. */
    class FetchLocalAddr {

        /**
         * Constructs a new FetchLocalAddr.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.FetchLocalAddr.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** FetchLocalAddr socketAddr. */
        socketAddr: Uint8Array;

        /** FetchLocalAddr relayServer. */
        relayServer: string;

        /** FetchLocalAddr socketAddrV6. */
        socketAddrV6: Uint8Array;

        /**
         * Creates a new FetchLocalAddr instance using the specified properties.
         * @param [properties] Properties to set
         * @returns FetchLocalAddr instance
         */
        static create(properties: hbb.FetchLocalAddr.$Shape): hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape;
        static create(properties?: hbb.FetchLocalAddr.$Properties): hbb.FetchLocalAddr;

        /**
         * Encodes the specified FetchLocalAddr message. Does not implicitly {@link hbb.FetchLocalAddr.verify|verify} messages.
         * @param message FetchLocalAddr message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.FetchLocalAddr.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified FetchLocalAddr message, length delimited. Does not implicitly {@link hbb.FetchLocalAddr.verify|verify} messages.
         * @param message FetchLocalAddr message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.FetchLocalAddr.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FetchLocalAddr message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape} FetchLocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape;

        /**
         * Decodes a FetchLocalAddr message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape} FetchLocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape;

        /**
         * Verifies a FetchLocalAddr message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a FetchLocalAddr message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns FetchLocalAddr
         */
        static fromObject(object: { [k: string]: any }): hbb.FetchLocalAddr;

        /**
         * Creates a plain object from a FetchLocalAddr message. Also converts values to other types if specified.
         * @param message FetchLocalAddr
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.FetchLocalAddr, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this FetchLocalAddr to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for FetchLocalAddr
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace FetchLocalAddr {

        /** Properties of a FetchLocalAddr. */
        interface $Properties {

            /** FetchLocalAddr socketAddr */
            socketAddr?: (Uint8Array|null);

            /** FetchLocalAddr relayServer */
            relayServer?: (string|null);

            /** FetchLocalAddr socketAddrV6 */
            socketAddrV6?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a FetchLocalAddr. */
        type $Shape = hbb.FetchLocalAddr.$Properties;
    }

    /**
     * Properties of a LocalAddr.
     * @deprecated Use hbb.LocalAddr.$Properties instead.
     */
    interface ILocalAddr extends hbb.LocalAddr.$Properties {
    }

    /** Represents a LocalAddr. */
    class LocalAddr {

        /**
         * Constructs a new LocalAddr.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.LocalAddr.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** LocalAddr socketAddr. */
        socketAddr: Uint8Array;

        /** LocalAddr localAddr. */
        localAddr: Uint8Array;

        /** LocalAddr relayServer. */
        relayServer: string;

        /** LocalAddr id. */
        id: string;

        /** LocalAddr version. */
        version: string;

        /** LocalAddr socketAddrV6. */
        socketAddrV6: Uint8Array;

        /**
         * Creates a new LocalAddr instance using the specified properties.
         * @param [properties] Properties to set
         * @returns LocalAddr instance
         */
        static create(properties: hbb.LocalAddr.$Shape): hbb.LocalAddr & hbb.LocalAddr.$Shape;
        static create(properties?: hbb.LocalAddr.$Properties): hbb.LocalAddr;

        /**
         * Encodes the specified LocalAddr message. Does not implicitly {@link hbb.LocalAddr.verify|verify} messages.
         * @param message LocalAddr message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.LocalAddr.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified LocalAddr message, length delimited. Does not implicitly {@link hbb.LocalAddr.verify|verify} messages.
         * @param message LocalAddr message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.LocalAddr.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LocalAddr message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.LocalAddr & hbb.LocalAddr.$Shape} LocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.LocalAddr & hbb.LocalAddr.$Shape;

        /**
         * Decodes a LocalAddr message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.LocalAddr & hbb.LocalAddr.$Shape} LocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.LocalAddr & hbb.LocalAddr.$Shape;

        /**
         * Verifies a LocalAddr message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a LocalAddr message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns LocalAddr
         */
        static fromObject(object: { [k: string]: any }): hbb.LocalAddr;

        /**
         * Creates a plain object from a LocalAddr message. Also converts values to other types if specified.
         * @param message LocalAddr
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.LocalAddr, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this LocalAddr to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for LocalAddr
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace LocalAddr {

        /** Properties of a LocalAddr. */
        interface $Properties {

            /** LocalAddr socketAddr */
            socketAddr?: (Uint8Array|null);

            /** LocalAddr localAddr */
            localAddr?: (Uint8Array|null);

            /** LocalAddr relayServer */
            relayServer?: (string|null);

            /** LocalAddr id */
            id?: (string|null);

            /** LocalAddr version */
            version?: (string|null);

            /** LocalAddr socketAddrV6 */
            socketAddrV6?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a LocalAddr. */
        type $Shape = hbb.LocalAddr.$Properties;
    }

    /**
     * Properties of a PeerDiscovery.
     * @deprecated Use hbb.PeerDiscovery.$Properties instead.
     */
    interface IPeerDiscovery extends hbb.PeerDiscovery.$Properties {
    }

    /** Represents a PeerDiscovery. */
    class PeerDiscovery {

        /**
         * Constructs a new PeerDiscovery.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.PeerDiscovery.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** PeerDiscovery cmd. */
        cmd: string;

        /** PeerDiscovery mac. */
        mac: string;

        /** PeerDiscovery id. */
        id: string;

        /** PeerDiscovery username. */
        username: string;

        /** PeerDiscovery hostname. */
        hostname: string;

        /** PeerDiscovery platform. */
        platform: string;

        /** PeerDiscovery misc. */
        misc: string;

        /**
         * Creates a new PeerDiscovery instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PeerDiscovery instance
         */
        static create(properties: hbb.PeerDiscovery.$Shape): hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape;
        static create(properties?: hbb.PeerDiscovery.$Properties): hbb.PeerDiscovery;

        /**
         * Encodes the specified PeerDiscovery message. Does not implicitly {@link hbb.PeerDiscovery.verify|verify} messages.
         * @param message PeerDiscovery message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.PeerDiscovery.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PeerDiscovery message, length delimited. Does not implicitly {@link hbb.PeerDiscovery.verify|verify} messages.
         * @param message PeerDiscovery message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.PeerDiscovery.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PeerDiscovery message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape} PeerDiscovery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape;

        /**
         * Decodes a PeerDiscovery message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape} PeerDiscovery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape;

        /**
         * Verifies a PeerDiscovery message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PeerDiscovery message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PeerDiscovery
         */
        static fromObject(object: { [k: string]: any }): hbb.PeerDiscovery;

        /**
         * Creates a plain object from a PeerDiscovery message. Also converts values to other types if specified.
         * @param message PeerDiscovery
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.PeerDiscovery, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PeerDiscovery to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for PeerDiscovery
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace PeerDiscovery {

        /** Properties of a PeerDiscovery. */
        interface $Properties {

            /** PeerDiscovery cmd */
            cmd?: (string|null);

            /** PeerDiscovery mac */
            mac?: (string|null);

            /** PeerDiscovery id */
            id?: (string|null);

            /** PeerDiscovery username */
            username?: (string|null);

            /** PeerDiscovery hostname */
            hostname?: (string|null);

            /** PeerDiscovery platform */
            platform?: (string|null);

            /** PeerDiscovery misc */
            misc?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a PeerDiscovery. */
        type $Shape = hbb.PeerDiscovery.$Properties;
    }

    /**
     * Properties of an OnlineRequest.
     * @deprecated Use hbb.OnlineRequest.$Properties instead.
     */
    interface IOnlineRequest extends hbb.OnlineRequest.$Properties {
    }

    /** Represents an OnlineRequest. */
    class OnlineRequest {

        /**
         * Constructs a new OnlineRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.OnlineRequest.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** OnlineRequest id. */
        id: string;

        /** OnlineRequest peers. */
        peers: string[];

        /**
         * Creates a new OnlineRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns OnlineRequest instance
         */
        static create(properties: hbb.OnlineRequest.$Shape): hbb.OnlineRequest & hbb.OnlineRequest.$Shape;
        static create(properties?: hbb.OnlineRequest.$Properties): hbb.OnlineRequest;

        /**
         * Encodes the specified OnlineRequest message. Does not implicitly {@link hbb.OnlineRequest.verify|verify} messages.
         * @param message OnlineRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.OnlineRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified OnlineRequest message, length delimited. Does not implicitly {@link hbb.OnlineRequest.verify|verify} messages.
         * @param message OnlineRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.OnlineRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an OnlineRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.OnlineRequest & hbb.OnlineRequest.$Shape} OnlineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.OnlineRequest & hbb.OnlineRequest.$Shape;

        /**
         * Decodes an OnlineRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.OnlineRequest & hbb.OnlineRequest.$Shape} OnlineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.OnlineRequest & hbb.OnlineRequest.$Shape;

        /**
         * Verifies an OnlineRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an OnlineRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns OnlineRequest
         */
        static fromObject(object: { [k: string]: any }): hbb.OnlineRequest;

        /**
         * Creates a plain object from an OnlineRequest message. Also converts values to other types if specified.
         * @param message OnlineRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.OnlineRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this OnlineRequest to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for OnlineRequest
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace OnlineRequest {

        /** Properties of an OnlineRequest. */
        interface $Properties {

            /** OnlineRequest id */
            id?: (string|null);

            /** OnlineRequest peers */
            peers?: (string[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an OnlineRequest. */
        type $Shape = hbb.OnlineRequest.$Properties;
    }

    /**
     * Properties of an OnlineResponse.
     * @deprecated Use hbb.OnlineResponse.$Properties instead.
     */
    interface IOnlineResponse extends hbb.OnlineResponse.$Properties {
    }

    /** Represents an OnlineResponse. */
    class OnlineResponse {

        /**
         * Constructs a new OnlineResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.OnlineResponse.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** OnlineResponse states. */
        states: Uint8Array;

        /**
         * Creates a new OnlineResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns OnlineResponse instance
         */
        static create(properties: hbb.OnlineResponse.$Shape): hbb.OnlineResponse & hbb.OnlineResponse.$Shape;
        static create(properties?: hbb.OnlineResponse.$Properties): hbb.OnlineResponse;

        /**
         * Encodes the specified OnlineResponse message. Does not implicitly {@link hbb.OnlineResponse.verify|verify} messages.
         * @param message OnlineResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.OnlineResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified OnlineResponse message, length delimited. Does not implicitly {@link hbb.OnlineResponse.verify|verify} messages.
         * @param message OnlineResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.OnlineResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an OnlineResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.OnlineResponse & hbb.OnlineResponse.$Shape} OnlineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.OnlineResponse & hbb.OnlineResponse.$Shape;

        /**
         * Decodes an OnlineResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.OnlineResponse & hbb.OnlineResponse.$Shape} OnlineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.OnlineResponse & hbb.OnlineResponse.$Shape;

        /**
         * Verifies an OnlineResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an OnlineResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns OnlineResponse
         */
        static fromObject(object: { [k: string]: any }): hbb.OnlineResponse;

        /**
         * Creates a plain object from an OnlineResponse message. Also converts values to other types if specified.
         * @param message OnlineResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.OnlineResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this OnlineResponse to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for OnlineResponse
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace OnlineResponse {

        /** Properties of an OnlineResponse. */
        interface $Properties {

            /** OnlineResponse states */
            states?: (Uint8Array|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of an OnlineResponse. */
        type $Shape = hbb.OnlineResponse.$Properties;
    }

    /**
     * Properties of a KeyExchange.
     * @deprecated Use hbb.KeyExchange.$Properties instead.
     */
    interface IKeyExchange extends hbb.KeyExchange.$Properties {
    }

    /** Represents a KeyExchange. */
    class KeyExchange {

        /**
         * Constructs a new KeyExchange.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.KeyExchange.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** KeyExchange keys. */
        keys: Uint8Array[];

        /**
         * Creates a new KeyExchange instance using the specified properties.
         * @param [properties] Properties to set
         * @returns KeyExchange instance
         */
        static create(properties: hbb.KeyExchange.$Shape): hbb.KeyExchange & hbb.KeyExchange.$Shape;
        static create(properties?: hbb.KeyExchange.$Properties): hbb.KeyExchange;

        /**
         * Encodes the specified KeyExchange message. Does not implicitly {@link hbb.KeyExchange.verify|verify} messages.
         * @param message KeyExchange message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.KeyExchange.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified KeyExchange message, length delimited. Does not implicitly {@link hbb.KeyExchange.verify|verify} messages.
         * @param message KeyExchange message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.KeyExchange.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a KeyExchange message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.KeyExchange & hbb.KeyExchange.$Shape} KeyExchange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.KeyExchange & hbb.KeyExchange.$Shape;

        /**
         * Decodes a KeyExchange message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.KeyExchange & hbb.KeyExchange.$Shape} KeyExchange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.KeyExchange & hbb.KeyExchange.$Shape;

        /**
         * Verifies a KeyExchange message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a KeyExchange message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns KeyExchange
         */
        static fromObject(object: { [k: string]: any }): hbb.KeyExchange;

        /**
         * Creates a plain object from a KeyExchange message. Also converts values to other types if specified.
         * @param message KeyExchange
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.KeyExchange, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this KeyExchange to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for KeyExchange
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace KeyExchange {

        /** Properties of a KeyExchange. */
        interface $Properties {

            /** KeyExchange keys */
            keys?: (Uint8Array[]|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a KeyExchange. */
        type $Shape = hbb.KeyExchange.$Properties;
    }

    /**
     * Properties of a HealthCheck.
     * @deprecated Use hbb.HealthCheck.$Properties instead.
     */
    interface IHealthCheck extends hbb.HealthCheck.$Properties {
    }

    /** Represents a HealthCheck. */
    class HealthCheck {

        /**
         * Constructs a new HealthCheck.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.HealthCheck.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** HealthCheck token. */
        token: string;

        /**
         * Creates a new HealthCheck instance using the specified properties.
         * @param [properties] Properties to set
         * @returns HealthCheck instance
         */
        static create(properties: hbb.HealthCheck.$Shape): hbb.HealthCheck & hbb.HealthCheck.$Shape;
        static create(properties?: hbb.HealthCheck.$Properties): hbb.HealthCheck;

        /**
         * Encodes the specified HealthCheck message. Does not implicitly {@link hbb.HealthCheck.verify|verify} messages.
         * @param message HealthCheck message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.HealthCheck.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified HealthCheck message, length delimited. Does not implicitly {@link hbb.HealthCheck.verify|verify} messages.
         * @param message HealthCheck message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.HealthCheck.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a HealthCheck message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.HealthCheck & hbb.HealthCheck.$Shape} HealthCheck
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.HealthCheck & hbb.HealthCheck.$Shape;

        /**
         * Decodes a HealthCheck message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.HealthCheck & hbb.HealthCheck.$Shape} HealthCheck
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.HealthCheck & hbb.HealthCheck.$Shape;

        /**
         * Verifies a HealthCheck message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a HealthCheck message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns HealthCheck
         */
        static fromObject(object: { [k: string]: any }): hbb.HealthCheck;

        /**
         * Creates a plain object from a HealthCheck message. Also converts values to other types if specified.
         * @param message HealthCheck
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.HealthCheck, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this HealthCheck to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for HealthCheck
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace HealthCheck {

        /** Properties of a HealthCheck. */
        interface $Properties {

            /** HealthCheck token */
            token?: (string|null);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Shape of a HealthCheck. */
        type $Shape = hbb.HealthCheck.$Properties;
    }

    /**
     * Properties of a RendezvousMessage.
     * @deprecated Use hbb.RendezvousMessage.$Properties instead.
     */
    interface IRendezvousMessage extends hbb.RendezvousMessage.$Properties {
    }

    /** Represents a RendezvousMessage. */
    class RendezvousMessage {

        /**
         * Constructs a new RendezvousMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: hbb.RendezvousMessage.$Properties);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];

        /** RendezvousMessage registerPeer. */
        registerPeer?: (hbb.RegisterPeer.$Properties|null);

        /** RendezvousMessage registerPeerResponse. */
        registerPeerResponse?: (hbb.RegisterPeerResponse.$Properties|null);

        /** RendezvousMessage punchHoleRequest. */
        punchHoleRequest?: (hbb.PunchHoleRequest.$Properties|null);

        /** RendezvousMessage punchHole. */
        punchHole?: (hbb.PunchHole.$Properties|null);

        /** RendezvousMessage punchHoleSent. */
        punchHoleSent?: (hbb.PunchHoleSent.$Properties|null);

        /** RendezvousMessage punchHoleResponse. */
        punchHoleResponse?: (hbb.PunchHoleResponse.$Properties|null);

        /** RendezvousMessage fetchLocalAddr. */
        fetchLocalAddr?: (hbb.FetchLocalAddr.$Properties|null);

        /** RendezvousMessage localAddr. */
        localAddr?: (hbb.LocalAddr.$Properties|null);

        /** RendezvousMessage configureUpdate. */
        configureUpdate?: (hbb.ConfigUpdate.$Properties|null);

        /** RendezvousMessage registerPk. */
        registerPk?: (hbb.RegisterPk.$Properties|null);

        /** RendezvousMessage registerPkResponse. */
        registerPkResponse?: (hbb.RegisterPkResponse.$Properties|null);

        /** RendezvousMessage softwareUpdate. */
        softwareUpdate?: (hbb.SoftwareUpdate.$Properties|null);

        /** RendezvousMessage requestRelay. */
        requestRelay?: (hbb.RequestRelay.$Properties|null);

        /** RendezvousMessage relayResponse. */
        relayResponse?: (hbb.RelayResponse.$Properties|null);

        /** RendezvousMessage testNatRequest. */
        testNatRequest?: (hbb.TestNatRequest.$Properties|null);

        /** RendezvousMessage testNatResponse. */
        testNatResponse?: (hbb.TestNatResponse.$Properties|null);

        /** RendezvousMessage peerDiscovery. */
        peerDiscovery?: (hbb.PeerDiscovery.$Properties|null);

        /** RendezvousMessage onlineRequest. */
        onlineRequest?: (hbb.OnlineRequest.$Properties|null);

        /** RendezvousMessage onlineResponse. */
        onlineResponse?: (hbb.OnlineResponse.$Properties|null);

        /** RendezvousMessage keyExchange. */
        keyExchange?: (hbb.KeyExchange.$Properties|null);

        /** RendezvousMessage hc. */
        hc?: (hbb.HealthCheck.$Properties|null);

        /** RendezvousMessage union. */
        union?: ("registerPeer"|"registerPeerResponse"|"punchHoleRequest"|"punchHole"|"punchHoleSent"|"punchHoleResponse"|"fetchLocalAddr"|"localAddr"|"configureUpdate"|"registerPk"|"registerPkResponse"|"softwareUpdate"|"requestRelay"|"relayResponse"|"testNatRequest"|"testNatResponse"|"peerDiscovery"|"onlineRequest"|"onlineResponse"|"keyExchange"|"hc");

        /**
         * Creates a new RendezvousMessage instance using the specified properties.
         * @param [properties] Properties to set
         * @returns RendezvousMessage instance
         */
        static create(properties: hbb.RendezvousMessage.$Shape): hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape;
        static create(properties?: hbb.RendezvousMessage.$Properties): hbb.RendezvousMessage;

        /**
         * Encodes the specified RendezvousMessage message. Does not implicitly {@link hbb.RendezvousMessage.verify|verify} messages.
         * @param message RendezvousMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encode(message: hbb.RendezvousMessage.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RendezvousMessage message, length delimited. Does not implicitly {@link hbb.RendezvousMessage.verify|verify} messages.
         * @param message RendezvousMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        static encodeDelimited(message: hbb.RendezvousMessage.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RendezvousMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns {hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape} RendezvousMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape;

        /**
         * Decodes a RendezvousMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns {hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape} RendezvousMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape;

        /**
         * Verifies a RendezvousMessage message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a RendezvousMessage message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns RendezvousMessage
         */
        static fromObject(object: { [k: string]: any }): hbb.RendezvousMessage;

        /**
         * Creates a plain object from a RendezvousMessage message. Also converts values to other types if specified.
         * @param message RendezvousMessage
         * @param [options] Conversion options
         * @returns Plain object
         */
        static toObject(message: hbb.RendezvousMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this RendezvousMessage to JSON.
         * @returns JSON object
         */
        toJSON(): { [k: string]: any };

        /**
         * Gets the type url for RendezvousMessage
         * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns The type url
         */
        static getTypeUrl(prefix?: string): string;
    }

    namespace RendezvousMessage {

        /** Properties of a RendezvousMessage. */
        interface $Properties {

            /** RendezvousMessage registerPeer */
            registerPeer?: (hbb.RegisterPeer.$Properties|null);

            /** RendezvousMessage registerPeerResponse */
            registerPeerResponse?: (hbb.RegisterPeerResponse.$Properties|null);

            /** RendezvousMessage punchHoleRequest */
            punchHoleRequest?: (hbb.PunchHoleRequest.$Properties|null);

            /** RendezvousMessage punchHole */
            punchHole?: (hbb.PunchHole.$Properties|null);

            /** RendezvousMessage punchHoleSent */
            punchHoleSent?: (hbb.PunchHoleSent.$Properties|null);

            /** RendezvousMessage punchHoleResponse */
            punchHoleResponse?: (hbb.PunchHoleResponse.$Properties|null);

            /** RendezvousMessage fetchLocalAddr */
            fetchLocalAddr?: (hbb.FetchLocalAddr.$Properties|null);

            /** RendezvousMessage localAddr */
            localAddr?: (hbb.LocalAddr.$Properties|null);

            /** RendezvousMessage configureUpdate */
            configureUpdate?: (hbb.ConfigUpdate.$Properties|null);

            /** RendezvousMessage registerPk */
            registerPk?: (hbb.RegisterPk.$Properties|null);

            /** RendezvousMessage registerPkResponse */
            registerPkResponse?: (hbb.RegisterPkResponse.$Properties|null);

            /** RendezvousMessage softwareUpdate */
            softwareUpdate?: (hbb.SoftwareUpdate.$Properties|null);

            /** RendezvousMessage requestRelay */
            requestRelay?: (hbb.RequestRelay.$Properties|null);

            /** RendezvousMessage relayResponse */
            relayResponse?: (hbb.RelayResponse.$Properties|null);

            /** RendezvousMessage testNatRequest */
            testNatRequest?: (hbb.TestNatRequest.$Properties|null);

            /** RendezvousMessage testNatResponse */
            testNatResponse?: (hbb.TestNatResponse.$Properties|null);

            /** RendezvousMessage peerDiscovery */
            peerDiscovery?: (hbb.PeerDiscovery.$Properties|null);

            /** RendezvousMessage onlineRequest */
            onlineRequest?: (hbb.OnlineRequest.$Properties|null);

            /** RendezvousMessage onlineResponse */
            onlineResponse?: (hbb.OnlineResponse.$Properties|null);

            /** RendezvousMessage keyExchange */
            keyExchange?: (hbb.KeyExchange.$Properties|null);

            /** RendezvousMessage hc */
            hc?: (hbb.HealthCheck.$Properties|null);

            /** RendezvousMessage union */
            union?: ("registerPeer"|"registerPeerResponse"|"punchHoleRequest"|"punchHole"|"punchHoleSent"|"punchHoleResponse"|"fetchLocalAddr"|"localAddr"|"configureUpdate"|"registerPk"|"registerPkResponse"|"softwareUpdate"|"requestRelay"|"relayResponse"|"testNatRequest"|"testNatResponse"|"peerDiscovery"|"onlineRequest"|"onlineResponse"|"keyExchange"|"hc");

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];
        }

        /** Narrowed shape of a RendezvousMessage. */
        type $Shape = {
          registerPeer?: hbb.RegisterPeer.$Shape|null;
          registerPeerResponse?: hbb.RegisterPeerResponse.$Shape|null;
          punchHoleRequest?: hbb.PunchHoleRequest.$Shape|null;
          punchHole?: hbb.PunchHole.$Shape|null;
          punchHoleSent?: hbb.PunchHoleSent.$Shape|null;
          punchHoleResponse?: hbb.PunchHoleResponse.$Shape|null;
          fetchLocalAddr?: hbb.FetchLocalAddr.$Shape|null;
          localAddr?: hbb.LocalAddr.$Shape|null;
          configureUpdate?: hbb.ConfigUpdate.$Shape|null;
          registerPk?: hbb.RegisterPk.$Shape|null;
          registerPkResponse?: hbb.RegisterPkResponse.$Shape|null;
          softwareUpdate?: hbb.SoftwareUpdate.$Shape|null;
          requestRelay?: hbb.RequestRelay.$Shape|null;
          relayResponse?: hbb.RelayResponse.$Shape|null;
          testNatRequest?: hbb.TestNatRequest.$Shape|null;
          testNatResponse?: hbb.TestNatResponse.$Shape|null;
          peerDiscovery?: hbb.PeerDiscovery.$Shape|null;
          onlineRequest?: hbb.OnlineRequest.$Shape|null;
          onlineResponse?: hbb.OnlineResponse.$Shape|null;
          keyExchange?: hbb.KeyExchange.$Shape|null;
          hc?: hbb.HealthCheck.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ union?: undefined; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPeer"; registerPeer: hbb.RegisterPeer.$Shape; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPeerResponse"; registerPeer?: null; registerPeerResponse: hbb.RegisterPeerResponse.$Shape; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHoleRequest"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest: hbb.PunchHoleRequest.$Shape; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHole"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole: hbb.PunchHole.$Shape; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHoleSent"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent: hbb.PunchHoleSent.$Shape; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHoleResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse: hbb.PunchHoleResponse.$Shape; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "fetchLocalAddr"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr: hbb.FetchLocalAddr.$Shape; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "localAddr"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr: hbb.LocalAddr.$Shape; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "configureUpdate"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate: hbb.ConfigUpdate.$Shape; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPk"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk: hbb.RegisterPk.$Shape; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPkResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse: hbb.RegisterPkResponse.$Shape; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "softwareUpdate"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate: hbb.SoftwareUpdate.$Shape; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "requestRelay"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay: hbb.RequestRelay.$Shape; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "relayResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse: hbb.RelayResponse.$Shape; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "testNatRequest"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest: hbb.TestNatRequest.$Shape; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "testNatResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse: hbb.TestNatResponse.$Shape; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "peerDiscovery"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery: hbb.PeerDiscovery.$Shape; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "onlineRequest"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest: hbb.OnlineRequest.$Shape; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "onlineResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse: hbb.OnlineResponse.$Shape; keyExchange?: null; hc?: null }|{ union?: "keyExchange"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange: hbb.KeyExchange.$Shape; hc?: null }|{ union?: "hc"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc: hbb.HealthCheck.$Shape })
        );
    }
}
