// Generated from rustdesk/hbb_common 334641686c731631fc51524bb2aa2ec2773069ee; AGPL-3.0, RustDesk contributors. Do not edit.
// rendezvous.proto SHA256 98c7c047761bbd7151b72d249f9e58479cc345827335589a1f5285c27ab1a469; message.proto SHA256 963cb7b27752edf7c200f563607fdbef76e1792951cbb4bb21d72508435f08eb.
/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-mixed-operators, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars, default-case, jsdoc/require-param*/
import $protobuf from "protobufjs/minimal.js";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;
const $Object = $util.global.Object, $undefined = $util.global.undefined, $Error = $util.global.Error, $RangeError = $util.global.RangeError, $TypeError = $util.global.TypeError, $String = $util.global.String, $Number = $util.global.Number, $Boolean = $util.global.Boolean, $Array = $util.global.Array;

// Exported root namespace
const $root = $protobuf.roots["rdwebReceiverRendezvous"] || ($protobuf.roots["rdwebReceiverRendezvous"] = {});

export const hbb = $root.hbb = (() => {

    /**
     * Namespace hbb.
     * @exports hbb
     * @namespace
     */
    const hbb = {};

    hbb.RegisterPeer = (function() {

        /**
         * Properties of a RegisterPeer.
         * @typedef {Object} hbb.RegisterPeer.$Properties
         * @property {string|null} [id] RegisterPeer id
         * @property {number|null} [serial] RegisterPeer serial
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a RegisterPeer.
         * @memberof hbb
         * @interface IRegisterPeer
         * @augments hbb.RegisterPeer.$Properties
         * @deprecated Use hbb.RegisterPeer.$Properties instead.
         */

        /**
         * Shape of a RegisterPeer.
         * @typedef {hbb.RegisterPeer.$Properties} hbb.RegisterPeer.$Shape
         */

        /**
         * Constructs a new RegisterPeer.
         * @memberof hbb
         * @classdesc Represents a RegisterPeer.
         * @constructor
         * @param {hbb.RegisterPeer.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const RegisterPeer = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * RegisterPeer id.
         * @member {string} id
         * @memberof hbb.RegisterPeer
         * @instance
         */
        RegisterPeer.prototype.id = "";

        /**
         * RegisterPeer serial.
         * @member {number} serial
         * @memberof hbb.RegisterPeer
         * @instance
         */
        RegisterPeer.prototype.serial = 0;

        /**
         * Creates a new RegisterPeer instance using the specified properties.
         * @function create
         * @memberof hbb.RegisterPeer
         * @static
         * @param {hbb.RegisterPeer.$Properties=} [properties] Properties to set
         * @returns {hbb.RegisterPeer} RegisterPeer instance
         * @type {{
         *   (properties: hbb.RegisterPeer.$Shape): hbb.RegisterPeer & hbb.RegisterPeer.$Shape;
         *   (properties?: hbb.RegisterPeer.$Properties): hbb.RegisterPeer;
         * }}
         */
        RegisterPeer.create = function(properties) {
            return new RegisterPeer(properties);
        };

        /**
         * Encodes the specified RegisterPeer message. Does not implicitly {@link hbb.RegisterPeer.verify|verify} messages.
         * @function encode
         * @memberof hbb.RegisterPeer
         * @static
         * @param {hbb.RegisterPeer.$Properties} message RegisterPeer message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPeer.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial") && message.serial !== 0)
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.serial);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified RegisterPeer message, length delimited. Does not implicitly {@link hbb.RegisterPeer.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.RegisterPeer
         * @static
         * @param {hbb.RegisterPeer.$Properties} message RegisterPeer message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPeer.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a RegisterPeer message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.RegisterPeer
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.RegisterPeer & hbb.RegisterPeer.$Shape} RegisterPeer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPeer.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.RegisterPeer();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 2: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.serial = value;
                        else
                            delete message.serial;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a RegisterPeer message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.RegisterPeer
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.RegisterPeer & hbb.RegisterPeer.$Shape} RegisterPeer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPeer.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a RegisterPeer message.
         * @function verify
         * @memberof hbb.RegisterPeer
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        RegisterPeer.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial"))
                if (!$util.isInteger(message.serial))
                    return "serial: integer expected";
            return null;
        };

        /**
         * Creates a RegisterPeer message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.RegisterPeer
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.RegisterPeer} RegisterPeer
         */
        RegisterPeer.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.RegisterPeer)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.RegisterPeer: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.RegisterPeer();
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.serial != null)
                if ($Number(object.serial) !== 0)
                    message.serial = object.serial | 0;
            return message;
        };

        /**
         * Creates a plain object from a RegisterPeer message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.RegisterPeer
         * @static
         * @param {hbb.RegisterPeer} message RegisterPeer
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        RegisterPeer.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.id = "";
                object.serial = 0;
            }
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial"))
                object.serial = message.serial;
            return object;
        };

        /**
         * Converts this RegisterPeer to JSON.
         * @function toJSON
         * @memberof hbb.RegisterPeer
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        RegisterPeer.prototype.toJSON = function() {
            return RegisterPeer.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for RegisterPeer
         * @function getTypeUrl
         * @memberof hbb.RegisterPeer
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        RegisterPeer.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.RegisterPeer";
        };

        return RegisterPeer;
    })();

    /**
     * ConnType enum.
     * @name hbb.ConnType
     * @enum {number}
     * @property {number} DEFAULT_CONN=0 DEFAULT_CONN value
     * @property {number} FILE_TRANSFER=1 FILE_TRANSFER value
     * @property {number} PORT_FORWARD=2 PORT_FORWARD value
     * @property {number} RDP=3 RDP value
     * @property {number} VIEW_CAMERA=4 VIEW_CAMERA value
     * @property {number} TERMINAL=5 TERMINAL value
     */
    hbb.ConnType = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "DEFAULT_CONN"] = 0;
        values[valuesById[1] = "FILE_TRANSFER"] = 1;
        values[valuesById[2] = "PORT_FORWARD"] = 2;
        values[valuesById[3] = "RDP"] = 3;
        values[valuesById[4] = "VIEW_CAMERA"] = 4;
        values[valuesById[5] = "TERMINAL"] = 5;
        return values;
    })();

    hbb.RegisterPeerResponse = (function() {

        /**
         * Properties of a RegisterPeerResponse.
         * @typedef {Object} hbb.RegisterPeerResponse.$Properties
         * @property {boolean|null} [requestPk] RegisterPeerResponse requestPk
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a RegisterPeerResponse.
         * @memberof hbb
         * @interface IRegisterPeerResponse
         * @augments hbb.RegisterPeerResponse.$Properties
         * @deprecated Use hbb.RegisterPeerResponse.$Properties instead.
         */

        /**
         * Shape of a RegisterPeerResponse.
         * @typedef {hbb.RegisterPeerResponse.$Properties} hbb.RegisterPeerResponse.$Shape
         */

        /**
         * Constructs a new RegisterPeerResponse.
         * @memberof hbb
         * @classdesc Represents a RegisterPeerResponse.
         * @constructor
         * @param {hbb.RegisterPeerResponse.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const RegisterPeerResponse = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * RegisterPeerResponse requestPk.
         * @member {boolean} requestPk
         * @memberof hbb.RegisterPeerResponse
         * @instance
         */
        RegisterPeerResponse.prototype.requestPk = false;

        /**
         * Creates a new RegisterPeerResponse instance using the specified properties.
         * @function create
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {hbb.RegisterPeerResponse.$Properties=} [properties] Properties to set
         * @returns {hbb.RegisterPeerResponse} RegisterPeerResponse instance
         * @type {{
         *   (properties: hbb.RegisterPeerResponse.$Shape): hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape;
         *   (properties?: hbb.RegisterPeerResponse.$Properties): hbb.RegisterPeerResponse;
         * }}
         */
        RegisterPeerResponse.create = function(properties) {
            return new RegisterPeerResponse(properties);
        };

        /**
         * Encodes the specified RegisterPeerResponse message. Does not implicitly {@link hbb.RegisterPeerResponse.verify|verify} messages.
         * @function encode
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {hbb.RegisterPeerResponse.$Properties} message RegisterPeerResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPeerResponse.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.requestPk != null && $Object.hasOwnProperty.call(message, "requestPk") && message.requestPk !== false)
                writer.uint32(/* id 2, wireType 0 =*/16).bool(message.requestPk);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified RegisterPeerResponse message, length delimited. Does not implicitly {@link hbb.RegisterPeerResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {hbb.RegisterPeerResponse.$Properties} message RegisterPeerResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPeerResponse.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a RegisterPeerResponse message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape} RegisterPeerResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPeerResponse.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.RegisterPeerResponse();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 2: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.requestPk = value;
                        else
                            delete message.requestPk;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a RegisterPeerResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.RegisterPeerResponse & hbb.RegisterPeerResponse.$Shape} RegisterPeerResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPeerResponse.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a RegisterPeerResponse message.
         * @function verify
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        RegisterPeerResponse.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.requestPk != null && $Object.hasOwnProperty.call(message, "requestPk"))
                if (typeof message.requestPk !== "boolean")
                    return "requestPk: boolean expected";
            return null;
        };

        /**
         * Creates a RegisterPeerResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.RegisterPeerResponse} RegisterPeerResponse
         */
        RegisterPeerResponse.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.RegisterPeerResponse)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.RegisterPeerResponse: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.RegisterPeerResponse();
            if (object.requestPk != null)
                if (object.requestPk)
                    message.requestPk = $Boolean(object.requestPk);
            return message;
        };

        /**
         * Creates a plain object from a RegisterPeerResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {hbb.RegisterPeerResponse} message RegisterPeerResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        RegisterPeerResponse.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults)
                object.requestPk = false;
            if (message.requestPk != null && $Object.hasOwnProperty.call(message, "requestPk"))
                object.requestPk = message.requestPk;
            return object;
        };

        /**
         * Converts this RegisterPeerResponse to JSON.
         * @function toJSON
         * @memberof hbb.RegisterPeerResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        RegisterPeerResponse.prototype.toJSON = function() {
            return RegisterPeerResponse.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for RegisterPeerResponse
         * @function getTypeUrl
         * @memberof hbb.RegisterPeerResponse
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        RegisterPeerResponse.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.RegisterPeerResponse";
        };

        return RegisterPeerResponse;
    })();

    hbb.PunchHoleRequest = (function() {

        /**
         * Properties of a PunchHoleRequest.
         * @typedef {Object} hbb.PunchHoleRequest.$Properties
         * @property {string|null} [id] PunchHoleRequest id
         * @property {hbb.NatType|null} [natType] PunchHoleRequest natType
         * @property {string|null} [licenceKey] PunchHoleRequest licenceKey
         * @property {hbb.ConnType|null} [connType] PunchHoleRequest connType
         * @property {string|null} [token] PunchHoleRequest token
         * @property {string|null} [version] PunchHoleRequest version
         * @property {number|null} [udpPort] PunchHoleRequest udpPort
         * @property {boolean|null} [forceRelay] PunchHoleRequest forceRelay
         * @property {number|null} [upnpPort] PunchHoleRequest upnpPort
         * @property {Uint8Array|null} [socketAddrV6] PunchHoleRequest socketAddrV6
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a PunchHoleRequest.
         * @memberof hbb
         * @interface IPunchHoleRequest
         * @augments hbb.PunchHoleRequest.$Properties
         * @deprecated Use hbb.PunchHoleRequest.$Properties instead.
         */

        /**
         * Shape of a PunchHoleRequest.
         * @typedef {hbb.PunchHoleRequest.$Properties} hbb.PunchHoleRequest.$Shape
         */

        /**
         * Constructs a new PunchHoleRequest.
         * @memberof hbb
         * @classdesc Represents a PunchHoleRequest.
         * @constructor
         * @param {hbb.PunchHoleRequest.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const PunchHoleRequest = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * PunchHoleRequest id.
         * @member {string} id
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.id = "";

        /**
         * PunchHoleRequest natType.
         * @member {hbb.NatType} natType
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.natType = 0;

        /**
         * PunchHoleRequest licenceKey.
         * @member {string} licenceKey
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.licenceKey = "";

        /**
         * PunchHoleRequest connType.
         * @member {hbb.ConnType} connType
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.connType = 0;

        /**
         * PunchHoleRequest token.
         * @member {string} token
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.token = "";

        /**
         * PunchHoleRequest version.
         * @member {string} version
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.version = "";

        /**
         * PunchHoleRequest udpPort.
         * @member {number} udpPort
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.udpPort = 0;

        /**
         * PunchHoleRequest forceRelay.
         * @member {boolean} forceRelay
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.forceRelay = false;

        /**
         * PunchHoleRequest upnpPort.
         * @member {number} upnpPort
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.upnpPort = 0;

        /**
         * PunchHoleRequest socketAddrV6.
         * @member {Uint8Array} socketAddrV6
         * @memberof hbb.PunchHoleRequest
         * @instance
         */
        PunchHoleRequest.prototype.socketAddrV6 = $util.newBuffer([]);

        /**
         * Creates a new PunchHoleRequest instance using the specified properties.
         * @function create
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {hbb.PunchHoleRequest.$Properties=} [properties] Properties to set
         * @returns {hbb.PunchHoleRequest} PunchHoleRequest instance
         * @type {{
         *   (properties: hbb.PunchHoleRequest.$Shape): hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape;
         *   (properties?: hbb.PunchHoleRequest.$Properties): hbb.PunchHoleRequest;
         * }}
         */
        PunchHoleRequest.create = function(properties) {
            return new PunchHoleRequest(properties);
        };

        /**
         * Encodes the specified PunchHoleRequest message. Does not implicitly {@link hbb.PunchHoleRequest.verify|verify} messages.
         * @function encode
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {hbb.PunchHoleRequest.$Properties} message PunchHoleRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHoleRequest.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType") && message.natType !== 0)
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.natType);
            if (message.licenceKey != null && $Object.hasOwnProperty.call(message, "licenceKey") && message.licenceKey !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.licenceKey);
            if (message.connType != null && $Object.hasOwnProperty.call(message, "connType") && message.connType !== 0)
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.connType);
            if (message.token != null && $Object.hasOwnProperty.call(message, "token") && message.token !== "")
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.token);
            if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== "")
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.version);
            if (message.udpPort != null && $Object.hasOwnProperty.call(message, "udpPort") && message.udpPort !== 0)
                writer.uint32(/* id 7, wireType 0 =*/56).int32(message.udpPort);
            if (message.forceRelay != null && $Object.hasOwnProperty.call(message, "forceRelay") && message.forceRelay !== false)
                writer.uint32(/* id 8, wireType 0 =*/64).bool(message.forceRelay);
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort") && message.upnpPort !== 0)
                writer.uint32(/* id 9, wireType 0 =*/72).int32(message.upnpPort);
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6") && message.socketAddrV6.length)
                writer.uint32(/* id 10, wireType 2 =*/82).bytes(message.socketAddrV6);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified PunchHoleRequest message, length delimited. Does not implicitly {@link hbb.PunchHoleRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {hbb.PunchHoleRequest.$Properties} message PunchHoleRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHoleRequest.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a PunchHoleRequest message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape} PunchHoleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHoleRequest.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.PunchHoleRequest();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 2: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.natType = value;
                        else
                            delete message.natType;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.licenceKey = value;
                        else
                            delete message.licenceKey;
                        continue;
                    }
                case 4: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.connType = value;
                        else
                            delete message.connType;
                        continue;
                    }
                case 5: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.token = value;
                        else
                            delete message.token;
                        continue;
                    }
                case 6: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.version = value;
                        else
                            delete message.version;
                        continue;
                    }
                case 7: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.udpPort = value;
                        else
                            delete message.udpPort;
                        continue;
                    }
                case 8: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.forceRelay = value;
                        else
                            delete message.forceRelay;
                        continue;
                    }
                case 9: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.upnpPort = value;
                        else
                            delete message.upnpPort;
                        continue;
                    }
                case 10: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddrV6 = value;
                        else
                            delete message.socketAddrV6;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a PunchHoleRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.PunchHoleRequest & hbb.PunchHoleRequest.$Shape} PunchHoleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHoleRequest.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PunchHoleRequest message.
         * @function verify
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PunchHoleRequest.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType"))
                if (typeof message.natType !== "number" || (message.natType | 0) !== message.natType)
                    return "natType: enum value expected";
            if (message.licenceKey != null && $Object.hasOwnProperty.call(message, "licenceKey"))
                if (!$util.isString(message.licenceKey))
                    return "licenceKey: string expected";
            if (message.connType != null && $Object.hasOwnProperty.call(message, "connType"))
                if (typeof message.connType !== "number" || (message.connType | 0) !== message.connType)
                    return "connType: enum value expected";
            if (message.token != null && $Object.hasOwnProperty.call(message, "token"))
                if (!$util.isString(message.token))
                    return "token: string expected";
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                if (!$util.isString(message.version))
                    return "version: string expected";
            if (message.udpPort != null && $Object.hasOwnProperty.call(message, "udpPort"))
                if (!$util.isInteger(message.udpPort))
                    return "udpPort: integer expected";
            if (message.forceRelay != null && $Object.hasOwnProperty.call(message, "forceRelay"))
                if (typeof message.forceRelay !== "boolean")
                    return "forceRelay: boolean expected";
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                if (!$util.isInteger(message.upnpPort))
                    return "upnpPort: integer expected";
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                if (!(message.socketAddrV6 && typeof message.socketAddrV6.length === "number" || $util.isString(message.socketAddrV6)))
                    return "socketAddrV6: buffer expected";
            return null;
        };

        /**
         * Creates a PunchHoleRequest message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.PunchHoleRequest} PunchHoleRequest
         */
        PunchHoleRequest.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.PunchHoleRequest)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.PunchHoleRequest: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.PunchHoleRequest();
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.natType !== 0 && (typeof object.natType !== "string" || $root.hbb.NatType[object.natType] !== 0))
                switch (object.natType) {
                case "UNKNOWN_NAT":
                case 0:
                    message.natType = 0;
                    break;
                case "ASYMMETRIC":
                case 1:
                    message.natType = 1;
                    break;
                case "SYMMETRIC":
                case 2:
                    message.natType = 2;
                    break;
                default:
                    if (typeof object.natType === "number" && (object.natType | 0) === object.natType)
                        message.natType = object.natType;
                }
            if (object.licenceKey != null)
                if (typeof object.licenceKey !== "string" || object.licenceKey.length)
                    message.licenceKey = $String(object.licenceKey);
            if (object.connType !== 0 && (typeof object.connType !== "string" || $root.hbb.ConnType[object.connType] !== 0))
                switch (object.connType) {
                case "DEFAULT_CONN":
                case 0:
                    message.connType = 0;
                    break;
                case "FILE_TRANSFER":
                case 1:
                    message.connType = 1;
                    break;
                case "PORT_FORWARD":
                case 2:
                    message.connType = 2;
                    break;
                case "RDP":
                case 3:
                    message.connType = 3;
                    break;
                case "VIEW_CAMERA":
                case 4:
                    message.connType = 4;
                    break;
                case "TERMINAL":
                case 5:
                    message.connType = 5;
                    break;
                default:
                    if (typeof object.connType === "number" && (object.connType | 0) === object.connType)
                        message.connType = object.connType;
                }
            if (object.token != null)
                if (typeof object.token !== "string" || object.token.length)
                    message.token = $String(object.token);
            if (object.version != null)
                if (typeof object.version !== "string" || object.version.length)
                    message.version = $String(object.version);
            if (object.udpPort != null)
                if ($Number(object.udpPort) !== 0)
                    message.udpPort = object.udpPort | 0;
            if (object.forceRelay != null)
                if (object.forceRelay)
                    message.forceRelay = $Boolean(object.forceRelay);
            if (object.upnpPort != null)
                if ($Number(object.upnpPort) !== 0)
                    message.upnpPort = object.upnpPort | 0;
            if (object.socketAddrV6 != null)
                if (object.socketAddrV6.length)
                    if (typeof object.socketAddrV6 === "string")
                        $util.base64.decode(object.socketAddrV6, message.socketAddrV6 = $util.newBuffer($util.base64.length(object.socketAddrV6)), 0);
                    else if (object.socketAddrV6.length >= 0)
                        message.socketAddrV6 = object.socketAddrV6;
            return message;
        };

        /**
         * Creates a plain object from a PunchHoleRequest message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {hbb.PunchHoleRequest} message PunchHoleRequest
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PunchHoleRequest.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.id = "";
                object.natType = options.enums === $String ? "UNKNOWN_NAT" : 0;
                object.licenceKey = "";
                object.connType = options.enums === $String ? "DEFAULT_CONN" : 0;
                object.token = "";
                object.version = "";
                object.udpPort = 0;
                object.forceRelay = false;
                object.upnpPort = 0;
                if (options.bytes === $String)
                    object.socketAddrV6 = "";
                else {
                    object.socketAddrV6 = [];
                    if (options.bytes !== $Array)
                        object.socketAddrV6 = $util.newBuffer(object.socketAddrV6);
                }
            }
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType"))
                object.natType = options.enums === $String ? $root.hbb.NatType[message.natType] === $undefined ? message.natType : $root.hbb.NatType[message.natType] : message.natType;
            if (message.licenceKey != null && $Object.hasOwnProperty.call(message, "licenceKey"))
                object.licenceKey = message.licenceKey;
            if (message.connType != null && $Object.hasOwnProperty.call(message, "connType"))
                object.connType = options.enums === $String ? $root.hbb.ConnType[message.connType] === $undefined ? message.connType : $root.hbb.ConnType[message.connType] : message.connType;
            if (message.token != null && $Object.hasOwnProperty.call(message, "token"))
                object.token = message.token;
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                object.version = message.version;
            if (message.udpPort != null && $Object.hasOwnProperty.call(message, "udpPort"))
                object.udpPort = message.udpPort;
            if (message.forceRelay != null && $Object.hasOwnProperty.call(message, "forceRelay"))
                object.forceRelay = message.forceRelay;
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                object.upnpPort = message.upnpPort;
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                object.socketAddrV6 = options.bytes === $String ? $util.base64.encode(message.socketAddrV6, 0, message.socketAddrV6.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddrV6) : message.socketAddrV6;
            return object;
        };

        /**
         * Converts this PunchHoleRequest to JSON.
         * @function toJSON
         * @memberof hbb.PunchHoleRequest
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PunchHoleRequest.prototype.toJSON = function() {
            return PunchHoleRequest.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for PunchHoleRequest
         * @function getTypeUrl
         * @memberof hbb.PunchHoleRequest
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        PunchHoleRequest.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.PunchHoleRequest";
        };

        return PunchHoleRequest;
    })();

    hbb.PunchHole = (function() {

        /**
         * Properties of a PunchHole.
         * @typedef {Object} hbb.PunchHole.$Properties
         * @property {Uint8Array|null} [socketAddr] PunchHole socketAddr
         * @property {string|null} [relayServer] PunchHole relayServer
         * @property {hbb.NatType|null} [natType] PunchHole natType
         * @property {number|null} [udpPort] PunchHole udpPort
         * @property {boolean|null} [forceRelay] PunchHole forceRelay
         * @property {number|null} [upnpPort] PunchHole upnpPort
         * @property {Uint8Array|null} [socketAddrV6] PunchHole socketAddrV6
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a PunchHole.
         * @memberof hbb
         * @interface IPunchHole
         * @augments hbb.PunchHole.$Properties
         * @deprecated Use hbb.PunchHole.$Properties instead.
         */

        /**
         * Shape of a PunchHole.
         * @typedef {hbb.PunchHole.$Properties} hbb.PunchHole.$Shape
         */

        /**
         * Constructs a new PunchHole.
         * @memberof hbb
         * @classdesc Represents a PunchHole.
         * @constructor
         * @param {hbb.PunchHole.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const PunchHole = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * PunchHole socketAddr.
         * @member {Uint8Array} socketAddr
         * @memberof hbb.PunchHole
         * @instance
         */
        PunchHole.prototype.socketAddr = $util.newBuffer([]);

        /**
         * PunchHole relayServer.
         * @member {string} relayServer
         * @memberof hbb.PunchHole
         * @instance
         */
        PunchHole.prototype.relayServer = "";

        /**
         * PunchHole natType.
         * @member {hbb.NatType} natType
         * @memberof hbb.PunchHole
         * @instance
         */
        PunchHole.prototype.natType = 0;

        /**
         * PunchHole udpPort.
         * @member {number} udpPort
         * @memberof hbb.PunchHole
         * @instance
         */
        PunchHole.prototype.udpPort = 0;

        /**
         * PunchHole forceRelay.
         * @member {boolean} forceRelay
         * @memberof hbb.PunchHole
         * @instance
         */
        PunchHole.prototype.forceRelay = false;

        /**
         * PunchHole upnpPort.
         * @member {number} upnpPort
         * @memberof hbb.PunchHole
         * @instance
         */
        PunchHole.prototype.upnpPort = 0;

        /**
         * PunchHole socketAddrV6.
         * @member {Uint8Array} socketAddrV6
         * @memberof hbb.PunchHole
         * @instance
         */
        PunchHole.prototype.socketAddrV6 = $util.newBuffer([]);

        /**
         * Creates a new PunchHole instance using the specified properties.
         * @function create
         * @memberof hbb.PunchHole
         * @static
         * @param {hbb.PunchHole.$Properties=} [properties] Properties to set
         * @returns {hbb.PunchHole} PunchHole instance
         * @type {{
         *   (properties: hbb.PunchHole.$Shape): hbb.PunchHole & hbb.PunchHole.$Shape;
         *   (properties?: hbb.PunchHole.$Properties): hbb.PunchHole;
         * }}
         */
        PunchHole.create = function(properties) {
            return new PunchHole(properties);
        };

        /**
         * Encodes the specified PunchHole message. Does not implicitly {@link hbb.PunchHole.verify|verify} messages.
         * @function encode
         * @memberof hbb.PunchHole
         * @static
         * @param {hbb.PunchHole.$Properties} message PunchHole message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHole.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr") && message.socketAddr.length)
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.socketAddr);
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer") && message.relayServer !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.relayServer);
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType") && message.natType !== 0)
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.natType);
            if (message.udpPort != null && $Object.hasOwnProperty.call(message, "udpPort") && message.udpPort !== 0)
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.udpPort);
            if (message.forceRelay != null && $Object.hasOwnProperty.call(message, "forceRelay") && message.forceRelay !== false)
                writer.uint32(/* id 5, wireType 0 =*/40).bool(message.forceRelay);
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort") && message.upnpPort !== 0)
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.upnpPort);
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6") && message.socketAddrV6.length)
                writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.socketAddrV6);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified PunchHole message, length delimited. Does not implicitly {@link hbb.PunchHole.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.PunchHole
         * @static
         * @param {hbb.PunchHole.$Properties} message PunchHole message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHole.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a PunchHole message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.PunchHole
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.PunchHole & hbb.PunchHole.$Shape} PunchHole
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHole.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.PunchHole();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddr = value;
                        else
                            delete message.socketAddr;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relayServer = value;
                        else
                            delete message.relayServer;
                        continue;
                    }
                case 3: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.natType = value;
                        else
                            delete message.natType;
                        continue;
                    }
                case 4: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.udpPort = value;
                        else
                            delete message.udpPort;
                        continue;
                    }
                case 5: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.forceRelay = value;
                        else
                            delete message.forceRelay;
                        continue;
                    }
                case 6: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.upnpPort = value;
                        else
                            delete message.upnpPort;
                        continue;
                    }
                case 7: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddrV6 = value;
                        else
                            delete message.socketAddrV6;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a PunchHole message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.PunchHole
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.PunchHole & hbb.PunchHole.$Shape} PunchHole
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHole.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PunchHole message.
         * @function verify
         * @memberof hbb.PunchHole
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PunchHole.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                if (!(message.socketAddr && typeof message.socketAddr.length === "number" || $util.isString(message.socketAddr)))
                    return "socketAddr: buffer expected";
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                if (!$util.isString(message.relayServer))
                    return "relayServer: string expected";
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType"))
                if (typeof message.natType !== "number" || (message.natType | 0) !== message.natType)
                    return "natType: enum value expected";
            if (message.udpPort != null && $Object.hasOwnProperty.call(message, "udpPort"))
                if (!$util.isInteger(message.udpPort))
                    return "udpPort: integer expected";
            if (message.forceRelay != null && $Object.hasOwnProperty.call(message, "forceRelay"))
                if (typeof message.forceRelay !== "boolean")
                    return "forceRelay: boolean expected";
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                if (!$util.isInteger(message.upnpPort))
                    return "upnpPort: integer expected";
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                if (!(message.socketAddrV6 && typeof message.socketAddrV6.length === "number" || $util.isString(message.socketAddrV6)))
                    return "socketAddrV6: buffer expected";
            return null;
        };

        /**
         * Creates a PunchHole message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.PunchHole
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.PunchHole} PunchHole
         */
        PunchHole.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.PunchHole)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.PunchHole: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.PunchHole();
            if (object.socketAddr != null)
                if (object.socketAddr.length)
                    if (typeof object.socketAddr === "string")
                        $util.base64.decode(object.socketAddr, message.socketAddr = $util.newBuffer($util.base64.length(object.socketAddr)), 0);
                    else if (object.socketAddr.length >= 0)
                        message.socketAddr = object.socketAddr;
            if (object.relayServer != null)
                if (typeof object.relayServer !== "string" || object.relayServer.length)
                    message.relayServer = $String(object.relayServer);
            if (object.natType !== 0 && (typeof object.natType !== "string" || $root.hbb.NatType[object.natType] !== 0))
                switch (object.natType) {
                case "UNKNOWN_NAT":
                case 0:
                    message.natType = 0;
                    break;
                case "ASYMMETRIC":
                case 1:
                    message.natType = 1;
                    break;
                case "SYMMETRIC":
                case 2:
                    message.natType = 2;
                    break;
                default:
                    if (typeof object.natType === "number" && (object.natType | 0) === object.natType)
                        message.natType = object.natType;
                }
            if (object.udpPort != null)
                if ($Number(object.udpPort) !== 0)
                    message.udpPort = object.udpPort | 0;
            if (object.forceRelay != null)
                if (object.forceRelay)
                    message.forceRelay = $Boolean(object.forceRelay);
            if (object.upnpPort != null)
                if ($Number(object.upnpPort) !== 0)
                    message.upnpPort = object.upnpPort | 0;
            if (object.socketAddrV6 != null)
                if (object.socketAddrV6.length)
                    if (typeof object.socketAddrV6 === "string")
                        $util.base64.decode(object.socketAddrV6, message.socketAddrV6 = $util.newBuffer($util.base64.length(object.socketAddrV6)), 0);
                    else if (object.socketAddrV6.length >= 0)
                        message.socketAddrV6 = object.socketAddrV6;
            return message;
        };

        /**
         * Creates a plain object from a PunchHole message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.PunchHole
         * @static
         * @param {hbb.PunchHole} message PunchHole
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PunchHole.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                if (options.bytes === $String)
                    object.socketAddr = "";
                else {
                    object.socketAddr = [];
                    if (options.bytes !== $Array)
                        object.socketAddr = $util.newBuffer(object.socketAddr);
                }
                object.relayServer = "";
                object.natType = options.enums === $String ? "UNKNOWN_NAT" : 0;
                object.udpPort = 0;
                object.forceRelay = false;
                object.upnpPort = 0;
                if (options.bytes === $String)
                    object.socketAddrV6 = "";
                else {
                    object.socketAddrV6 = [];
                    if (options.bytes !== $Array)
                        object.socketAddrV6 = $util.newBuffer(object.socketAddrV6);
                }
            }
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                object.socketAddr = options.bytes === $String ? $util.base64.encode(message.socketAddr, 0, message.socketAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddr) : message.socketAddr;
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                object.relayServer = message.relayServer;
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType"))
                object.natType = options.enums === $String ? $root.hbb.NatType[message.natType] === $undefined ? message.natType : $root.hbb.NatType[message.natType] : message.natType;
            if (message.udpPort != null && $Object.hasOwnProperty.call(message, "udpPort"))
                object.udpPort = message.udpPort;
            if (message.forceRelay != null && $Object.hasOwnProperty.call(message, "forceRelay"))
                object.forceRelay = message.forceRelay;
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                object.upnpPort = message.upnpPort;
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                object.socketAddrV6 = options.bytes === $String ? $util.base64.encode(message.socketAddrV6, 0, message.socketAddrV6.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddrV6) : message.socketAddrV6;
            return object;
        };

        /**
         * Converts this PunchHole to JSON.
         * @function toJSON
         * @memberof hbb.PunchHole
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PunchHole.prototype.toJSON = function() {
            return PunchHole.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for PunchHole
         * @function getTypeUrl
         * @memberof hbb.PunchHole
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        PunchHole.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.PunchHole";
        };

        return PunchHole;
    })();

    hbb.TestNatRequest = (function() {

        /**
         * Properties of a TestNatRequest.
         * @typedef {Object} hbb.TestNatRequest.$Properties
         * @property {number|null} [serial] TestNatRequest serial
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a TestNatRequest.
         * @memberof hbb
         * @interface ITestNatRequest
         * @augments hbb.TestNatRequest.$Properties
         * @deprecated Use hbb.TestNatRequest.$Properties instead.
         */

        /**
         * Shape of a TestNatRequest.
         * @typedef {hbb.TestNatRequest.$Properties} hbb.TestNatRequest.$Shape
         */

        /**
         * Constructs a new TestNatRequest.
         * @memberof hbb
         * @classdesc Represents a TestNatRequest.
         * @constructor
         * @param {hbb.TestNatRequest.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const TestNatRequest = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * TestNatRequest serial.
         * @member {number} serial
         * @memberof hbb.TestNatRequest
         * @instance
         */
        TestNatRequest.prototype.serial = 0;

        /**
         * Creates a new TestNatRequest instance using the specified properties.
         * @function create
         * @memberof hbb.TestNatRequest
         * @static
         * @param {hbb.TestNatRequest.$Properties=} [properties] Properties to set
         * @returns {hbb.TestNatRequest} TestNatRequest instance
         * @type {{
         *   (properties: hbb.TestNatRequest.$Shape): hbb.TestNatRequest & hbb.TestNatRequest.$Shape;
         *   (properties?: hbb.TestNatRequest.$Properties): hbb.TestNatRequest;
         * }}
         */
        TestNatRequest.create = function(properties) {
            return new TestNatRequest(properties);
        };

        /**
         * Encodes the specified TestNatRequest message. Does not implicitly {@link hbb.TestNatRequest.verify|verify} messages.
         * @function encode
         * @memberof hbb.TestNatRequest
         * @static
         * @param {hbb.TestNatRequest.$Properties} message TestNatRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TestNatRequest.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial") && message.serial !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.serial);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified TestNatRequest message, length delimited. Does not implicitly {@link hbb.TestNatRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.TestNatRequest
         * @static
         * @param {hbb.TestNatRequest.$Properties} message TestNatRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TestNatRequest.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a TestNatRequest message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.TestNatRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.TestNatRequest & hbb.TestNatRequest.$Shape} TestNatRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TestNatRequest.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.TestNatRequest();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.serial = value;
                        else
                            delete message.serial;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a TestNatRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.TestNatRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.TestNatRequest & hbb.TestNatRequest.$Shape} TestNatRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TestNatRequest.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a TestNatRequest message.
         * @function verify
         * @memberof hbb.TestNatRequest
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        TestNatRequest.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial"))
                if (!$util.isInteger(message.serial))
                    return "serial: integer expected";
            return null;
        };

        /**
         * Creates a TestNatRequest message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.TestNatRequest
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.TestNatRequest} TestNatRequest
         */
        TestNatRequest.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.TestNatRequest)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.TestNatRequest: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.TestNatRequest();
            if (object.serial != null)
                if ($Number(object.serial) !== 0)
                    message.serial = object.serial | 0;
            return message;
        };

        /**
         * Creates a plain object from a TestNatRequest message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.TestNatRequest
         * @static
         * @param {hbb.TestNatRequest} message TestNatRequest
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        TestNatRequest.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults)
                object.serial = 0;
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial"))
                object.serial = message.serial;
            return object;
        };

        /**
         * Converts this TestNatRequest to JSON.
         * @function toJSON
         * @memberof hbb.TestNatRequest
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        TestNatRequest.prototype.toJSON = function() {
            return TestNatRequest.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for TestNatRequest
         * @function getTypeUrl
         * @memberof hbb.TestNatRequest
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        TestNatRequest.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.TestNatRequest";
        };

        return TestNatRequest;
    })();

    hbb.TestNatResponse = (function() {

        /**
         * Properties of a TestNatResponse.
         * @typedef {Object} hbb.TestNatResponse.$Properties
         * @property {number|null} [port] TestNatResponse port
         * @property {hbb.ConfigUpdate.$Properties|null} [cu] TestNatResponse cu
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a TestNatResponse.
         * @memberof hbb
         * @interface ITestNatResponse
         * @augments hbb.TestNatResponse.$Properties
         * @deprecated Use hbb.TestNatResponse.$Properties instead.
         */

        /**
         * Shape of a TestNatResponse.
         * @typedef {hbb.TestNatResponse.$Properties} hbb.TestNatResponse.$Shape
         */

        /**
         * Constructs a new TestNatResponse.
         * @memberof hbb
         * @classdesc Represents a TestNatResponse.
         * @constructor
         * @param {hbb.TestNatResponse.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const TestNatResponse = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * TestNatResponse port.
         * @member {number} port
         * @memberof hbb.TestNatResponse
         * @instance
         */
        TestNatResponse.prototype.port = 0;

        /**
         * TestNatResponse cu.
         * @member {hbb.ConfigUpdate.$Properties|null|undefined} cu
         * @memberof hbb.TestNatResponse
         * @instance
         */
        TestNatResponse.prototype.cu = null;

        /**
         * Creates a new TestNatResponse instance using the specified properties.
         * @function create
         * @memberof hbb.TestNatResponse
         * @static
         * @param {hbb.TestNatResponse.$Properties=} [properties] Properties to set
         * @returns {hbb.TestNatResponse} TestNatResponse instance
         * @type {{
         *   (properties: hbb.TestNatResponse.$Shape): hbb.TestNatResponse & hbb.TestNatResponse.$Shape;
         *   (properties?: hbb.TestNatResponse.$Properties): hbb.TestNatResponse;
         * }}
         */
        TestNatResponse.create = function(properties) {
            return new TestNatResponse(properties);
        };

        /**
         * Encodes the specified TestNatResponse message. Does not implicitly {@link hbb.TestNatResponse.verify|verify} messages.
         * @function encode
         * @memberof hbb.TestNatResponse
         * @static
         * @param {hbb.TestNatResponse.$Properties} message TestNatResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TestNatResponse.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.port != null && $Object.hasOwnProperty.call(message, "port") && message.port !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.port);
            if (message.cu != null && $Object.hasOwnProperty.call(message, "cu"))
                $root.hbb.ConfigUpdate.encode(message.cu, writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified TestNatResponse message, length delimited. Does not implicitly {@link hbb.TestNatResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.TestNatResponse
         * @static
         * @param {hbb.TestNatResponse.$Properties} message TestNatResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TestNatResponse.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a TestNatResponse message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.TestNatResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.TestNatResponse & hbb.TestNatResponse.$Shape} TestNatResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TestNatResponse.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.TestNatResponse();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.port = value;
                        else
                            delete message.port;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        message.cu = $root.hbb.ConfigUpdate.decode(reader, reader.uint32(), $undefined, _depth + 1, message.cu);
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a TestNatResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.TestNatResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.TestNatResponse & hbb.TestNatResponse.$Shape} TestNatResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TestNatResponse.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a TestNatResponse message.
         * @function verify
         * @memberof hbb.TestNatResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        TestNatResponse.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.port != null && $Object.hasOwnProperty.call(message, "port"))
                if (!$util.isInteger(message.port))
                    return "port: integer expected";
            if (message.cu != null && $Object.hasOwnProperty.call(message, "cu")) {
                let error = $root.hbb.ConfigUpdate.verify(message.cu, _depth + 1);
                if (error)
                    return "cu." + error;
            }
            return null;
        };

        /**
         * Creates a TestNatResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.TestNatResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.TestNatResponse} TestNatResponse
         */
        TestNatResponse.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.TestNatResponse)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.TestNatResponse: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.TestNatResponse();
            if (object.port != null)
                if ($Number(object.port) !== 0)
                    message.port = object.port | 0;
            if (object.cu != null) {
                if (!$util.isObject(object.cu))
                    throw $TypeError(".hbb.TestNatResponse.cu: object expected");
                message.cu = $root.hbb.ConfigUpdate.fromObject(object.cu, _depth + 1);
            }
            return message;
        };

        /**
         * Creates a plain object from a TestNatResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.TestNatResponse
         * @static
         * @param {hbb.TestNatResponse} message TestNatResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        TestNatResponse.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.port = 0;
                object.cu = null;
            }
            if (message.port != null && $Object.hasOwnProperty.call(message, "port"))
                object.port = message.port;
            if (message.cu != null && $Object.hasOwnProperty.call(message, "cu"))
                object.cu = $root.hbb.ConfigUpdate.toObject(message.cu, options, _depth + 1);
            return object;
        };

        /**
         * Converts this TestNatResponse to JSON.
         * @function toJSON
         * @memberof hbb.TestNatResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        TestNatResponse.prototype.toJSON = function() {
            return TestNatResponse.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for TestNatResponse
         * @function getTypeUrl
         * @memberof hbb.TestNatResponse
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        TestNatResponse.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.TestNatResponse";
        };

        return TestNatResponse;
    })();

    /**
     * NatType enum.
     * @name hbb.NatType
     * @enum {number}
     * @property {number} UNKNOWN_NAT=0 UNKNOWN_NAT value
     * @property {number} ASYMMETRIC=1 ASYMMETRIC value
     * @property {number} SYMMETRIC=2 SYMMETRIC value
     */
    hbb.NatType = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UNKNOWN_NAT"] = 0;
        values[valuesById[1] = "ASYMMETRIC"] = 1;
        values[valuesById[2] = "SYMMETRIC"] = 2;
        return values;
    })();

    hbb.PunchHoleSent = (function() {

        /**
         * Properties of a PunchHoleSent.
         * @typedef {Object} hbb.PunchHoleSent.$Properties
         * @property {Uint8Array|null} [socketAddr] PunchHoleSent socketAddr
         * @property {string|null} [id] PunchHoleSent id
         * @property {string|null} [relayServer] PunchHoleSent relayServer
         * @property {hbb.NatType|null} [natType] PunchHoleSent natType
         * @property {string|null} [version] PunchHoleSent version
         * @property {number|null} [upnpPort] PunchHoleSent upnpPort
         * @property {Uint8Array|null} [socketAddrV6] PunchHoleSent socketAddrV6
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a PunchHoleSent.
         * @memberof hbb
         * @interface IPunchHoleSent
         * @augments hbb.PunchHoleSent.$Properties
         * @deprecated Use hbb.PunchHoleSent.$Properties instead.
         */

        /**
         * Shape of a PunchHoleSent.
         * @typedef {hbb.PunchHoleSent.$Properties} hbb.PunchHoleSent.$Shape
         */

        /**
         * Constructs a new PunchHoleSent.
         * @memberof hbb
         * @classdesc Represents a PunchHoleSent.
         * @constructor
         * @param {hbb.PunchHoleSent.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const PunchHoleSent = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * PunchHoleSent socketAddr.
         * @member {Uint8Array} socketAddr
         * @memberof hbb.PunchHoleSent
         * @instance
         */
        PunchHoleSent.prototype.socketAddr = $util.newBuffer([]);

        /**
         * PunchHoleSent id.
         * @member {string} id
         * @memberof hbb.PunchHoleSent
         * @instance
         */
        PunchHoleSent.prototype.id = "";

        /**
         * PunchHoleSent relayServer.
         * @member {string} relayServer
         * @memberof hbb.PunchHoleSent
         * @instance
         */
        PunchHoleSent.prototype.relayServer = "";

        /**
         * PunchHoleSent natType.
         * @member {hbb.NatType} natType
         * @memberof hbb.PunchHoleSent
         * @instance
         */
        PunchHoleSent.prototype.natType = 0;

        /**
         * PunchHoleSent version.
         * @member {string} version
         * @memberof hbb.PunchHoleSent
         * @instance
         */
        PunchHoleSent.prototype.version = "";

        /**
         * PunchHoleSent upnpPort.
         * @member {number} upnpPort
         * @memberof hbb.PunchHoleSent
         * @instance
         */
        PunchHoleSent.prototype.upnpPort = 0;

        /**
         * PunchHoleSent socketAddrV6.
         * @member {Uint8Array} socketAddrV6
         * @memberof hbb.PunchHoleSent
         * @instance
         */
        PunchHoleSent.prototype.socketAddrV6 = $util.newBuffer([]);

        /**
         * Creates a new PunchHoleSent instance using the specified properties.
         * @function create
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {hbb.PunchHoleSent.$Properties=} [properties] Properties to set
         * @returns {hbb.PunchHoleSent} PunchHoleSent instance
         * @type {{
         *   (properties: hbb.PunchHoleSent.$Shape): hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape;
         *   (properties?: hbb.PunchHoleSent.$Properties): hbb.PunchHoleSent;
         * }}
         */
        PunchHoleSent.create = function(properties) {
            return new PunchHoleSent(properties);
        };

        /**
         * Encodes the specified PunchHoleSent message. Does not implicitly {@link hbb.PunchHoleSent.verify|verify} messages.
         * @function encode
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {hbb.PunchHoleSent.$Properties} message PunchHoleSent message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHoleSent.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr") && message.socketAddr.length)
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.socketAddr);
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.id);
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer") && message.relayServer !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.relayServer);
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType") && message.natType !== 0)
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.natType);
            if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== "")
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.version);
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort") && message.upnpPort !== 0)
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.upnpPort);
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6") && message.socketAddrV6.length)
                writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.socketAddrV6);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified PunchHoleSent message, length delimited. Does not implicitly {@link hbb.PunchHoleSent.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {hbb.PunchHoleSent.$Properties} message PunchHoleSent message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHoleSent.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a PunchHoleSent message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape} PunchHoleSent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHoleSent.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.PunchHoleSent();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddr = value;
                        else
                            delete message.socketAddr;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relayServer = value;
                        else
                            delete message.relayServer;
                        continue;
                    }
                case 4: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.natType = value;
                        else
                            delete message.natType;
                        continue;
                    }
                case 5: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.version = value;
                        else
                            delete message.version;
                        continue;
                    }
                case 6: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.upnpPort = value;
                        else
                            delete message.upnpPort;
                        continue;
                    }
                case 7: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddrV6 = value;
                        else
                            delete message.socketAddrV6;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a PunchHoleSent message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.PunchHoleSent & hbb.PunchHoleSent.$Shape} PunchHoleSent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHoleSent.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PunchHoleSent message.
         * @function verify
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PunchHoleSent.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                if (!(message.socketAddr && typeof message.socketAddr.length === "number" || $util.isString(message.socketAddr)))
                    return "socketAddr: buffer expected";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                if (!$util.isString(message.relayServer))
                    return "relayServer: string expected";
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType"))
                if (typeof message.natType !== "number" || (message.natType | 0) !== message.natType)
                    return "natType: enum value expected";
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                if (!$util.isString(message.version))
                    return "version: string expected";
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                if (!$util.isInteger(message.upnpPort))
                    return "upnpPort: integer expected";
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                if (!(message.socketAddrV6 && typeof message.socketAddrV6.length === "number" || $util.isString(message.socketAddrV6)))
                    return "socketAddrV6: buffer expected";
            return null;
        };

        /**
         * Creates a PunchHoleSent message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.PunchHoleSent} PunchHoleSent
         */
        PunchHoleSent.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.PunchHoleSent)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.PunchHoleSent: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.PunchHoleSent();
            if (object.socketAddr != null)
                if (object.socketAddr.length)
                    if (typeof object.socketAddr === "string")
                        $util.base64.decode(object.socketAddr, message.socketAddr = $util.newBuffer($util.base64.length(object.socketAddr)), 0);
                    else if (object.socketAddr.length >= 0)
                        message.socketAddr = object.socketAddr;
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.relayServer != null)
                if (typeof object.relayServer !== "string" || object.relayServer.length)
                    message.relayServer = $String(object.relayServer);
            if (object.natType !== 0 && (typeof object.natType !== "string" || $root.hbb.NatType[object.natType] !== 0))
                switch (object.natType) {
                case "UNKNOWN_NAT":
                case 0:
                    message.natType = 0;
                    break;
                case "ASYMMETRIC":
                case 1:
                    message.natType = 1;
                    break;
                case "SYMMETRIC":
                case 2:
                    message.natType = 2;
                    break;
                default:
                    if (typeof object.natType === "number" && (object.natType | 0) === object.natType)
                        message.natType = object.natType;
                }
            if (object.version != null)
                if (typeof object.version !== "string" || object.version.length)
                    message.version = $String(object.version);
            if (object.upnpPort != null)
                if ($Number(object.upnpPort) !== 0)
                    message.upnpPort = object.upnpPort | 0;
            if (object.socketAddrV6 != null)
                if (object.socketAddrV6.length)
                    if (typeof object.socketAddrV6 === "string")
                        $util.base64.decode(object.socketAddrV6, message.socketAddrV6 = $util.newBuffer($util.base64.length(object.socketAddrV6)), 0);
                    else if (object.socketAddrV6.length >= 0)
                        message.socketAddrV6 = object.socketAddrV6;
            return message;
        };

        /**
         * Creates a plain object from a PunchHoleSent message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {hbb.PunchHoleSent} message PunchHoleSent
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PunchHoleSent.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                if (options.bytes === $String)
                    object.socketAddr = "";
                else {
                    object.socketAddr = [];
                    if (options.bytes !== $Array)
                        object.socketAddr = $util.newBuffer(object.socketAddr);
                }
                object.id = "";
                object.relayServer = "";
                object.natType = options.enums === $String ? "UNKNOWN_NAT" : 0;
                object.version = "";
                object.upnpPort = 0;
                if (options.bytes === $String)
                    object.socketAddrV6 = "";
                else {
                    object.socketAddrV6 = [];
                    if (options.bytes !== $Array)
                        object.socketAddrV6 = $util.newBuffer(object.socketAddrV6);
                }
            }
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                object.socketAddr = options.bytes === $String ? $util.base64.encode(message.socketAddr, 0, message.socketAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddr) : message.socketAddr;
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                object.relayServer = message.relayServer;
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType"))
                object.natType = options.enums === $String ? $root.hbb.NatType[message.natType] === $undefined ? message.natType : $root.hbb.NatType[message.natType] : message.natType;
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                object.version = message.version;
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                object.upnpPort = message.upnpPort;
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                object.socketAddrV6 = options.bytes === $String ? $util.base64.encode(message.socketAddrV6, 0, message.socketAddrV6.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddrV6) : message.socketAddrV6;
            return object;
        };

        /**
         * Converts this PunchHoleSent to JSON.
         * @function toJSON
         * @memberof hbb.PunchHoleSent
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PunchHoleSent.prototype.toJSON = function() {
            return PunchHoleSent.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for PunchHoleSent
         * @function getTypeUrl
         * @memberof hbb.PunchHoleSent
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        PunchHoleSent.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.PunchHoleSent";
        };

        return PunchHoleSent;
    })();

    hbb.RegisterPk = (function() {

        /**
         * Properties of a RegisterPk.
         * @typedef {Object} hbb.RegisterPk.$Properties
         * @property {string|null} [id] RegisterPk id
         * @property {Uint8Array|null} [uuid] RegisterPk uuid
         * @property {Uint8Array|null} [pk] RegisterPk pk
         * @property {string|null} [oldId] RegisterPk oldId
         * @property {boolean|null} [noRegisterDevice] RegisterPk noRegisterDevice
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a RegisterPk.
         * @memberof hbb
         * @interface IRegisterPk
         * @augments hbb.RegisterPk.$Properties
         * @deprecated Use hbb.RegisterPk.$Properties instead.
         */

        /**
         * Shape of a RegisterPk.
         * @typedef {hbb.RegisterPk.$Properties} hbb.RegisterPk.$Shape
         */

        /**
         * Constructs a new RegisterPk.
         * @memberof hbb
         * @classdesc Represents a RegisterPk.
         * @constructor
         * @param {hbb.RegisterPk.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const RegisterPk = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * RegisterPk id.
         * @member {string} id
         * @memberof hbb.RegisterPk
         * @instance
         */
        RegisterPk.prototype.id = "";

        /**
         * RegisterPk uuid.
         * @member {Uint8Array} uuid
         * @memberof hbb.RegisterPk
         * @instance
         */
        RegisterPk.prototype.uuid = $util.newBuffer([]);

        /**
         * RegisterPk pk.
         * @member {Uint8Array} pk
         * @memberof hbb.RegisterPk
         * @instance
         */
        RegisterPk.prototype.pk = $util.newBuffer([]);

        /**
         * RegisterPk oldId.
         * @member {string} oldId
         * @memberof hbb.RegisterPk
         * @instance
         */
        RegisterPk.prototype.oldId = "";

        /**
         * RegisterPk noRegisterDevice.
         * @member {boolean} noRegisterDevice
         * @memberof hbb.RegisterPk
         * @instance
         */
        RegisterPk.prototype.noRegisterDevice = false;

        /**
         * Creates a new RegisterPk instance using the specified properties.
         * @function create
         * @memberof hbb.RegisterPk
         * @static
         * @param {hbb.RegisterPk.$Properties=} [properties] Properties to set
         * @returns {hbb.RegisterPk} RegisterPk instance
         * @type {{
         *   (properties: hbb.RegisterPk.$Shape): hbb.RegisterPk & hbb.RegisterPk.$Shape;
         *   (properties?: hbb.RegisterPk.$Properties): hbb.RegisterPk;
         * }}
         */
        RegisterPk.create = function(properties) {
            return new RegisterPk(properties);
        };

        /**
         * Encodes the specified RegisterPk message. Does not implicitly {@link hbb.RegisterPk.verify|verify} messages.
         * @function encode
         * @memberof hbb.RegisterPk
         * @static
         * @param {hbb.RegisterPk.$Properties} message RegisterPk message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPk.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid") && message.uuid.length)
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.uuid);
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk") && message.pk.length)
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.pk);
            if (message.oldId != null && $Object.hasOwnProperty.call(message, "oldId") && message.oldId !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.oldId);
            if (message.noRegisterDevice != null && $Object.hasOwnProperty.call(message, "noRegisterDevice") && message.noRegisterDevice !== false)
                writer.uint32(/* id 5, wireType 0 =*/40).bool(message.noRegisterDevice);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified RegisterPk message, length delimited. Does not implicitly {@link hbb.RegisterPk.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.RegisterPk
         * @static
         * @param {hbb.RegisterPk.$Properties} message RegisterPk message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPk.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a RegisterPk message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.RegisterPk
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.RegisterPk & hbb.RegisterPk.$Shape} RegisterPk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPk.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.RegisterPk();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.uuid = value;
                        else
                            delete message.uuid;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.pk = value;
                        else
                            delete message.pk;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.oldId = value;
                        else
                            delete message.oldId;
                        continue;
                    }
                case 5: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.noRegisterDevice = value;
                        else
                            delete message.noRegisterDevice;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a RegisterPk message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.RegisterPk
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.RegisterPk & hbb.RegisterPk.$Shape} RegisterPk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPk.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a RegisterPk message.
         * @function verify
         * @memberof hbb.RegisterPk
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        RegisterPk.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid"))
                if (!(message.uuid && typeof message.uuid.length === "number" || $util.isString(message.uuid)))
                    return "uuid: buffer expected";
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk"))
                if (!(message.pk && typeof message.pk.length === "number" || $util.isString(message.pk)))
                    return "pk: buffer expected";
            if (message.oldId != null && $Object.hasOwnProperty.call(message, "oldId"))
                if (!$util.isString(message.oldId))
                    return "oldId: string expected";
            if (message.noRegisterDevice != null && $Object.hasOwnProperty.call(message, "noRegisterDevice"))
                if (typeof message.noRegisterDevice !== "boolean")
                    return "noRegisterDevice: boolean expected";
            return null;
        };

        /**
         * Creates a RegisterPk message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.RegisterPk
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.RegisterPk} RegisterPk
         */
        RegisterPk.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.RegisterPk)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.RegisterPk: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.RegisterPk();
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.uuid != null)
                if (object.uuid.length)
                    if (typeof object.uuid === "string")
                        $util.base64.decode(object.uuid, message.uuid = $util.newBuffer($util.base64.length(object.uuid)), 0);
                    else if (object.uuid.length >= 0)
                        message.uuid = object.uuid;
            if (object.pk != null)
                if (object.pk.length)
                    if (typeof object.pk === "string")
                        $util.base64.decode(object.pk, message.pk = $util.newBuffer($util.base64.length(object.pk)), 0);
                    else if (object.pk.length >= 0)
                        message.pk = object.pk;
            if (object.oldId != null)
                if (typeof object.oldId !== "string" || object.oldId.length)
                    message.oldId = $String(object.oldId);
            if (object.noRegisterDevice != null)
                if (object.noRegisterDevice)
                    message.noRegisterDevice = $Boolean(object.noRegisterDevice);
            return message;
        };

        /**
         * Creates a plain object from a RegisterPk message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.RegisterPk
         * @static
         * @param {hbb.RegisterPk} message RegisterPk
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        RegisterPk.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.id = "";
                if (options.bytes === $String)
                    object.uuid = "";
                else {
                    object.uuid = [];
                    if (options.bytes !== $Array)
                        object.uuid = $util.newBuffer(object.uuid);
                }
                if (options.bytes === $String)
                    object.pk = "";
                else {
                    object.pk = [];
                    if (options.bytes !== $Array)
                        object.pk = $util.newBuffer(object.pk);
                }
                object.oldId = "";
                object.noRegisterDevice = false;
            }
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid"))
                object.uuid = options.bytes === $String ? $util.base64.encode(message.uuid, 0, message.uuid.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.uuid) : message.uuid;
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk"))
                object.pk = options.bytes === $String ? $util.base64.encode(message.pk, 0, message.pk.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.pk) : message.pk;
            if (message.oldId != null && $Object.hasOwnProperty.call(message, "oldId"))
                object.oldId = message.oldId;
            if (message.noRegisterDevice != null && $Object.hasOwnProperty.call(message, "noRegisterDevice"))
                object.noRegisterDevice = message.noRegisterDevice;
            return object;
        };

        /**
         * Converts this RegisterPk to JSON.
         * @function toJSON
         * @memberof hbb.RegisterPk
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        RegisterPk.prototype.toJSON = function() {
            return RegisterPk.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for RegisterPk
         * @function getTypeUrl
         * @memberof hbb.RegisterPk
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        RegisterPk.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.RegisterPk";
        };

        return RegisterPk;
    })();

    hbb.RegisterPkResponse = (function() {

        /**
         * Properties of a RegisterPkResponse.
         * @typedef {Object} hbb.RegisterPkResponse.$Properties
         * @property {hbb.RegisterPkResponse.Result|null} [result] RegisterPkResponse result
         * @property {number|null} [keepAlive] RegisterPkResponse keepAlive
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a RegisterPkResponse.
         * @memberof hbb
         * @interface IRegisterPkResponse
         * @augments hbb.RegisterPkResponse.$Properties
         * @deprecated Use hbb.RegisterPkResponse.$Properties instead.
         */

        /**
         * Shape of a RegisterPkResponse.
         * @typedef {hbb.RegisterPkResponse.$Properties} hbb.RegisterPkResponse.$Shape
         */

        /**
         * Constructs a new RegisterPkResponse.
         * @memberof hbb
         * @classdesc Represents a RegisterPkResponse.
         * @constructor
         * @param {hbb.RegisterPkResponse.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const RegisterPkResponse = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * RegisterPkResponse result.
         * @member {hbb.RegisterPkResponse.Result} result
         * @memberof hbb.RegisterPkResponse
         * @instance
         */
        RegisterPkResponse.prototype.result = 0;

        /**
         * RegisterPkResponse keepAlive.
         * @member {number} keepAlive
         * @memberof hbb.RegisterPkResponse
         * @instance
         */
        RegisterPkResponse.prototype.keepAlive = 0;

        /**
         * Creates a new RegisterPkResponse instance using the specified properties.
         * @function create
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {hbb.RegisterPkResponse.$Properties=} [properties] Properties to set
         * @returns {hbb.RegisterPkResponse} RegisterPkResponse instance
         * @type {{
         *   (properties: hbb.RegisterPkResponse.$Shape): hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape;
         *   (properties?: hbb.RegisterPkResponse.$Properties): hbb.RegisterPkResponse;
         * }}
         */
        RegisterPkResponse.create = function(properties) {
            return new RegisterPkResponse(properties);
        };

        /**
         * Encodes the specified RegisterPkResponse message. Does not implicitly {@link hbb.RegisterPkResponse.verify|verify} messages.
         * @function encode
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {hbb.RegisterPkResponse.$Properties} message RegisterPkResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPkResponse.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.result != null && $Object.hasOwnProperty.call(message, "result") && message.result !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.result);
            if (message.keepAlive != null && $Object.hasOwnProperty.call(message, "keepAlive") && message.keepAlive !== 0)
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.keepAlive);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified RegisterPkResponse message, length delimited. Does not implicitly {@link hbb.RegisterPkResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {hbb.RegisterPkResponse.$Properties} message RegisterPkResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RegisterPkResponse.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a RegisterPkResponse message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape} RegisterPkResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPkResponse.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.RegisterPkResponse();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.result = value;
                        else
                            delete message.result;
                        continue;
                    }
                case 2: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.keepAlive = value;
                        else
                            delete message.keepAlive;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a RegisterPkResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.RegisterPkResponse & hbb.RegisterPkResponse.$Shape} RegisterPkResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RegisterPkResponse.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a RegisterPkResponse message.
         * @function verify
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        RegisterPkResponse.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.result != null && $Object.hasOwnProperty.call(message, "result"))
                if (typeof message.result !== "number" || (message.result | 0) !== message.result)
                    return "result: enum value expected";
            if (message.keepAlive != null && $Object.hasOwnProperty.call(message, "keepAlive"))
                if (!$util.isInteger(message.keepAlive))
                    return "keepAlive: integer expected";
            return null;
        };

        /**
         * Creates a RegisterPkResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.RegisterPkResponse} RegisterPkResponse
         */
        RegisterPkResponse.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.RegisterPkResponse)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.RegisterPkResponse: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.RegisterPkResponse();
            if (object.result !== 0 && (typeof object.result !== "string" || $root.hbb.RegisterPkResponse.Result[object.result] !== 0))
                switch (object.result) {
                case "OK":
                case 0:
                    message.result = 0;
                    break;
                case "UUID_MISMATCH":
                case 2:
                    message.result = 2;
                    break;
                case "ID_EXISTS":
                case 3:
                    message.result = 3;
                    break;
                case "TOO_FREQUENT":
                case 4:
                    message.result = 4;
                    break;
                case "INVALID_ID_FORMAT":
                case 5:
                    message.result = 5;
                    break;
                case "NOT_SUPPORT":
                case 6:
                    message.result = 6;
                    break;
                case "SERVER_ERROR":
                case 7:
                    message.result = 7;
                    break;
                default:
                    if (typeof object.result === "number" && (object.result | 0) === object.result)
                        message.result = object.result;
                }
            if (object.keepAlive != null)
                if ($Number(object.keepAlive) !== 0)
                    message.keepAlive = object.keepAlive | 0;
            return message;
        };

        /**
         * Creates a plain object from a RegisterPkResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {hbb.RegisterPkResponse} message RegisterPkResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        RegisterPkResponse.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.result = options.enums === $String ? "OK" : 0;
                object.keepAlive = 0;
            }
            if (message.result != null && $Object.hasOwnProperty.call(message, "result"))
                object.result = options.enums === $String ? $root.hbb.RegisterPkResponse.Result[message.result] === $undefined ? message.result : $root.hbb.RegisterPkResponse.Result[message.result] : message.result;
            if (message.keepAlive != null && $Object.hasOwnProperty.call(message, "keepAlive"))
                object.keepAlive = message.keepAlive;
            return object;
        };

        /**
         * Converts this RegisterPkResponse to JSON.
         * @function toJSON
         * @memberof hbb.RegisterPkResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        RegisterPkResponse.prototype.toJSON = function() {
            return RegisterPkResponse.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for RegisterPkResponse
         * @function getTypeUrl
         * @memberof hbb.RegisterPkResponse
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        RegisterPkResponse.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.RegisterPkResponse";
        };

        /**
         * Result enum.
         * @name hbb.RegisterPkResponse.Result
         * @enum {number}
         * @property {number} OK=0 OK value
         * @property {number} UUID_MISMATCH=2 UUID_MISMATCH value
         * @property {number} ID_EXISTS=3 ID_EXISTS value
         * @property {number} TOO_FREQUENT=4 TOO_FREQUENT value
         * @property {number} INVALID_ID_FORMAT=5 INVALID_ID_FORMAT value
         * @property {number} NOT_SUPPORT=6 NOT_SUPPORT value
         * @property {number} SERVER_ERROR=7 SERVER_ERROR value
         */
        RegisterPkResponse.Result = (function() {
            const valuesById = $Object.create(null), values = $Object.create(valuesById);
            values[valuesById[0] = "OK"] = 0;
            values[valuesById[2] = "UUID_MISMATCH"] = 2;
            values[valuesById[3] = "ID_EXISTS"] = 3;
            values[valuesById[4] = "TOO_FREQUENT"] = 4;
            values[valuesById[5] = "INVALID_ID_FORMAT"] = 5;
            values[valuesById[6] = "NOT_SUPPORT"] = 6;
            values[valuesById[7] = "SERVER_ERROR"] = 7;
            return values;
        })();

        return RegisterPkResponse;
    })();

    hbb.PunchHoleResponse = (function() {

        /**
         * Properties of a PunchHoleResponse.
         * @typedef {Object} hbb.PunchHoleResponse.$Properties
         * @property {Uint8Array|null} [socketAddr] PunchHoleResponse socketAddr
         * @property {Uint8Array|null} [pk] PunchHoleResponse pk
         * @property {hbb.PunchHoleResponse.Failure|null} [failure] PunchHoleResponse failure
         * @property {string|null} [relayServer] PunchHoleResponse relayServer
         * @property {hbb.NatType|null} [natType] PunchHoleResponse natType
         * @property {boolean|null} [isLocal] PunchHoleResponse isLocal
         * @property {string|null} [otherFailure] PunchHoleResponse otherFailure
         * @property {number|null} [feedback] PunchHoleResponse feedback
         * @property {boolean|null} [isUdp] PunchHoleResponse isUdp
         * @property {number|null} [upnpPort] PunchHoleResponse upnpPort
         * @property {Uint8Array|null} [socketAddrV6] PunchHoleResponse socketAddrV6
         * @property {"natType"|"isLocal"} [union] PunchHoleResponse union
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a PunchHoleResponse.
         * @memberof hbb
         * @interface IPunchHoleResponse
         * @augments hbb.PunchHoleResponse.$Properties
         * @deprecated Use hbb.PunchHoleResponse.$Properties instead.
         */

        /**
         * Narrowed shape of a PunchHoleResponse.
         * @typedef {{
         *   socketAddr?: Uint8Array|null;
         *   pk?: Uint8Array|null;
         *   failure?: hbb.PunchHoleResponse.Failure|null;
         *   relayServer?: string|null;
         *   natType?: hbb.NatType|null;
         *   isLocal?: boolean|null;
         *   otherFailure?: string|null;
         *   feedback?: number|null;
         *   isUdp?: boolean|null;
         *   upnpPort?: number|null;
         *   socketAddrV6?: Uint8Array|null;
         *   $unknowns?: Array.<Uint8Array>;
         * } & (
         *   ({ union?: undefined; natType?: null; isLocal?: null }|{ union?: "natType"; natType: hbb.NatType; isLocal?: null }|{ union?: "isLocal"; natType?: null; isLocal: boolean })
         * )} hbb.PunchHoleResponse.$Shape
         */

        /**
         * Constructs a new PunchHoleResponse.
         * @memberof hbb
         * @classdesc Represents a PunchHoleResponse.
         * @constructor
         * @param {hbb.PunchHoleResponse.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const PunchHoleResponse = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * PunchHoleResponse socketAddr.
         * @member {Uint8Array} socketAddr
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.socketAddr = $util.newBuffer([]);

        /**
         * PunchHoleResponse pk.
         * @member {Uint8Array} pk
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.pk = $util.newBuffer([]);

        /**
         * PunchHoleResponse failure.
         * @member {hbb.PunchHoleResponse.Failure} failure
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.failure = 0;

        /**
         * PunchHoleResponse relayServer.
         * @member {string} relayServer
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.relayServer = "";

        /**
         * PunchHoleResponse natType.
         * @member {hbb.NatType|null|undefined} natType
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.natType = null;

        /**
         * PunchHoleResponse isLocal.
         * @member {boolean|null|undefined} isLocal
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.isLocal = null;

        /**
         * PunchHoleResponse otherFailure.
         * @member {string} otherFailure
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.otherFailure = "";

        /**
         * PunchHoleResponse feedback.
         * @member {number} feedback
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.feedback = 0;

        /**
         * PunchHoleResponse isUdp.
         * @member {boolean} isUdp
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.isUdp = false;

        /**
         * PunchHoleResponse upnpPort.
         * @member {number} upnpPort
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.upnpPort = 0;

        /**
         * PunchHoleResponse socketAddrV6.
         * @member {Uint8Array} socketAddrV6
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        PunchHoleResponse.prototype.socketAddrV6 = $util.newBuffer([]);

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * PunchHoleResponse union.
         * @member {"natType"|"isLocal"|undefined} union
         * @memberof hbb.PunchHoleResponse
         * @instance
         */
        $Object.defineProperty(PunchHoleResponse.prototype, "union", {
            get: $util.oneOfGetter($oneOfFields = ["natType", "isLocal"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new PunchHoleResponse instance using the specified properties.
         * @function create
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {hbb.PunchHoleResponse.$Properties=} [properties] Properties to set
         * @returns {hbb.PunchHoleResponse} PunchHoleResponse instance
         * @type {{
         *   (properties: hbb.PunchHoleResponse.$Shape): hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape;
         *   (properties?: hbb.PunchHoleResponse.$Properties): hbb.PunchHoleResponse;
         * }}
         */
        PunchHoleResponse.create = function(properties) {
            return new PunchHoleResponse(properties);
        };

        /**
         * Encodes the specified PunchHoleResponse message. Does not implicitly {@link hbb.PunchHoleResponse.verify|verify} messages.
         * @function encode
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {hbb.PunchHoleResponse.$Properties} message PunchHoleResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHoleResponse.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr") && message.socketAddr.length)
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.socketAddr);
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk") && message.pk.length)
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.pk);
            if (message.failure != null && $Object.hasOwnProperty.call(message, "failure") && message.failure !== 0)
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.failure);
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer") && message.relayServer !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.relayServer);
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType"))
                writer.uint32(/* id 5, wireType 0 =*/40).int32(message.natType);
            if (message.isLocal != null && $Object.hasOwnProperty.call(message, "isLocal"))
                writer.uint32(/* id 6, wireType 0 =*/48).bool(message.isLocal);
            if (message.otherFailure != null && $Object.hasOwnProperty.call(message, "otherFailure") && message.otherFailure !== "")
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.otherFailure);
            if (message.feedback != null && $Object.hasOwnProperty.call(message, "feedback") && message.feedback !== 0)
                writer.uint32(/* id 8, wireType 0 =*/64).int32(message.feedback);
            if (message.isUdp != null && $Object.hasOwnProperty.call(message, "isUdp") && message.isUdp !== false)
                writer.uint32(/* id 9, wireType 0 =*/72).bool(message.isUdp);
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort") && message.upnpPort !== 0)
                writer.uint32(/* id 10, wireType 0 =*/80).int32(message.upnpPort);
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6") && message.socketAddrV6.length)
                writer.uint32(/* id 11, wireType 2 =*/90).bytes(message.socketAddrV6);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified PunchHoleResponse message, length delimited. Does not implicitly {@link hbb.PunchHoleResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {hbb.PunchHoleResponse.$Properties} message PunchHoleResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PunchHoleResponse.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a PunchHoleResponse message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape} PunchHoleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHoleResponse.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.PunchHoleResponse();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddr = value;
                        else
                            delete message.socketAddr;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.pk = value;
                        else
                            delete message.pk;
                        continue;
                    }
                case 3: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.failure = value;
                        else
                            delete message.failure;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relayServer = value;
                        else
                            delete message.relayServer;
                        continue;
                    }
                case 5: {
                        if (wireType !== 0)
                            break;
                        message.natType = reader.int32();
                        message.union = "natType";
                        continue;
                    }
                case 6: {
                        if (wireType !== 0)
                            break;
                        message.isLocal = reader.bool();
                        message.union = "isLocal";
                        continue;
                    }
                case 7: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.otherFailure = value;
                        else
                            delete message.otherFailure;
                        continue;
                    }
                case 8: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.feedback = value;
                        else
                            delete message.feedback;
                        continue;
                    }
                case 9: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.isUdp = value;
                        else
                            delete message.isUdp;
                        continue;
                    }
                case 10: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.upnpPort = value;
                        else
                            delete message.upnpPort;
                        continue;
                    }
                case 11: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddrV6 = value;
                        else
                            delete message.socketAddrV6;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a PunchHoleResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.PunchHoleResponse & hbb.PunchHoleResponse.$Shape} PunchHoleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PunchHoleResponse.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PunchHoleResponse message.
         * @function verify
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PunchHoleResponse.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            let properties = {};
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                if (!(message.socketAddr && typeof message.socketAddr.length === "number" || $util.isString(message.socketAddr)))
                    return "socketAddr: buffer expected";
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk"))
                if (!(message.pk && typeof message.pk.length === "number" || $util.isString(message.pk)))
                    return "pk: buffer expected";
            if (message.failure != null && $Object.hasOwnProperty.call(message, "failure"))
                if (typeof message.failure !== "number" || (message.failure | 0) !== message.failure)
                    return "failure: enum value expected";
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                if (!$util.isString(message.relayServer))
                    return "relayServer: string expected";
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType")) {
                properties.union = 1;
                if (typeof message.natType !== "number" || (message.natType | 0) !== message.natType)
                    return "natType: enum value expected";
            }
            if (message.isLocal != null && $Object.hasOwnProperty.call(message, "isLocal")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                if (typeof message.isLocal !== "boolean")
                    return "isLocal: boolean expected";
            }
            if (message.otherFailure != null && $Object.hasOwnProperty.call(message, "otherFailure"))
                if (!$util.isString(message.otherFailure))
                    return "otherFailure: string expected";
            if (message.feedback != null && $Object.hasOwnProperty.call(message, "feedback"))
                if (!$util.isInteger(message.feedback))
                    return "feedback: integer expected";
            if (message.isUdp != null && $Object.hasOwnProperty.call(message, "isUdp"))
                if (typeof message.isUdp !== "boolean")
                    return "isUdp: boolean expected";
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                if (!$util.isInteger(message.upnpPort))
                    return "upnpPort: integer expected";
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                if (!(message.socketAddrV6 && typeof message.socketAddrV6.length === "number" || $util.isString(message.socketAddrV6)))
                    return "socketAddrV6: buffer expected";
            return null;
        };

        /**
         * Creates a PunchHoleResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.PunchHoleResponse} PunchHoleResponse
         */
        PunchHoleResponse.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.PunchHoleResponse)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.PunchHoleResponse: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.PunchHoleResponse();
            if (object.socketAddr != null)
                if (object.socketAddr.length)
                    if (typeof object.socketAddr === "string")
                        $util.base64.decode(object.socketAddr, message.socketAddr = $util.newBuffer($util.base64.length(object.socketAddr)), 0);
                    else if (object.socketAddr.length >= 0)
                        message.socketAddr = object.socketAddr;
            if (object.pk != null)
                if (object.pk.length)
                    if (typeof object.pk === "string")
                        $util.base64.decode(object.pk, message.pk = $util.newBuffer($util.base64.length(object.pk)), 0);
                    else if (object.pk.length >= 0)
                        message.pk = object.pk;
            if (object.failure !== 0 && (typeof object.failure !== "string" || $root.hbb.PunchHoleResponse.Failure[object.failure] !== 0))
                switch (object.failure) {
                case "ID_NOT_EXIST":
                case 0:
                    message.failure = 0;
                    break;
                case "OFFLINE":
                case 2:
                    message.failure = 2;
                    break;
                case "LICENSE_MISMATCH":
                case 3:
                    message.failure = 3;
                    break;
                case "LICENSE_OVERUSE":
                case 4:
                    message.failure = 4;
                    break;
                default:
                    if (typeof object.failure === "number" && (object.failure | 0) === object.failure)
                        message.failure = object.failure;
                }
            if (object.relayServer != null)
                if (typeof object.relayServer !== "string" || object.relayServer.length)
                    message.relayServer = $String(object.relayServer);
            switch (object.natType) {
            case "UNKNOWN_NAT":
            case 0:
                message.natType = 0;
                break;
            case "ASYMMETRIC":
            case 1:
                message.natType = 1;
                break;
            case "SYMMETRIC":
            case 2:
                message.natType = 2;
                break;
            default:
                if (typeof object.natType === "number" && (object.natType | 0) === object.natType)
                    message.natType = object.natType;
            }
            if (object.isLocal != null)
                message.isLocal = $Boolean(object.isLocal);
            if (object.otherFailure != null)
                if (typeof object.otherFailure !== "string" || object.otherFailure.length)
                    message.otherFailure = $String(object.otherFailure);
            if (object.feedback != null)
                if ($Number(object.feedback) !== 0)
                    message.feedback = object.feedback | 0;
            if (object.isUdp != null)
                if (object.isUdp)
                    message.isUdp = $Boolean(object.isUdp);
            if (object.upnpPort != null)
                if ($Number(object.upnpPort) !== 0)
                    message.upnpPort = object.upnpPort | 0;
            if (object.socketAddrV6 != null)
                if (object.socketAddrV6.length)
                    if (typeof object.socketAddrV6 === "string")
                        $util.base64.decode(object.socketAddrV6, message.socketAddrV6 = $util.newBuffer($util.base64.length(object.socketAddrV6)), 0);
                    else if (object.socketAddrV6.length >= 0)
                        message.socketAddrV6 = object.socketAddrV6;
            return message;
        };

        /**
         * Creates a plain object from a PunchHoleResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {hbb.PunchHoleResponse} message PunchHoleResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PunchHoleResponse.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                if (options.bytes === $String)
                    object.socketAddr = "";
                else {
                    object.socketAddr = [];
                    if (options.bytes !== $Array)
                        object.socketAddr = $util.newBuffer(object.socketAddr);
                }
                if (options.bytes === $String)
                    object.pk = "";
                else {
                    object.pk = [];
                    if (options.bytes !== $Array)
                        object.pk = $util.newBuffer(object.pk);
                }
                object.failure = options.enums === $String ? "ID_NOT_EXIST" : 0;
                object.relayServer = "";
                object.otherFailure = "";
                object.feedback = 0;
                object.isUdp = false;
                object.upnpPort = 0;
                if (options.bytes === $String)
                    object.socketAddrV6 = "";
                else {
                    object.socketAddrV6 = [];
                    if (options.bytes !== $Array)
                        object.socketAddrV6 = $util.newBuffer(object.socketAddrV6);
                }
            }
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                object.socketAddr = options.bytes === $String ? $util.base64.encode(message.socketAddr, 0, message.socketAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddr) : message.socketAddr;
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk"))
                object.pk = options.bytes === $String ? $util.base64.encode(message.pk, 0, message.pk.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.pk) : message.pk;
            if (message.failure != null && $Object.hasOwnProperty.call(message, "failure"))
                object.failure = options.enums === $String ? $root.hbb.PunchHoleResponse.Failure[message.failure] === $undefined ? message.failure : $root.hbb.PunchHoleResponse.Failure[message.failure] : message.failure;
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                object.relayServer = message.relayServer;
            if (message.natType != null && $Object.hasOwnProperty.call(message, "natType")) {
                object.natType = options.enums === $String ? $root.hbb.NatType[message.natType] === $undefined ? message.natType : $root.hbb.NatType[message.natType] : message.natType;
                if (options.oneofs)
                    object.union = "natType";
            }
            if (message.isLocal != null && $Object.hasOwnProperty.call(message, "isLocal")) {
                object.isLocal = message.isLocal;
                if (options.oneofs)
                    object.union = "isLocal";
            }
            if (message.otherFailure != null && $Object.hasOwnProperty.call(message, "otherFailure"))
                object.otherFailure = message.otherFailure;
            if (message.feedback != null && $Object.hasOwnProperty.call(message, "feedback"))
                object.feedback = message.feedback;
            if (message.isUdp != null && $Object.hasOwnProperty.call(message, "isUdp"))
                object.isUdp = message.isUdp;
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                object.upnpPort = message.upnpPort;
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                object.socketAddrV6 = options.bytes === $String ? $util.base64.encode(message.socketAddrV6, 0, message.socketAddrV6.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddrV6) : message.socketAddrV6;
            return object;
        };

        /**
         * Converts this PunchHoleResponse to JSON.
         * @function toJSON
         * @memberof hbb.PunchHoleResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PunchHoleResponse.prototype.toJSON = function() {
            return PunchHoleResponse.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for PunchHoleResponse
         * @function getTypeUrl
         * @memberof hbb.PunchHoleResponse
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        PunchHoleResponse.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.PunchHoleResponse";
        };

        /**
         * Failure enum.
         * @name hbb.PunchHoleResponse.Failure
         * @enum {number}
         * @property {number} ID_NOT_EXIST=0 ID_NOT_EXIST value
         * @property {number} OFFLINE=2 OFFLINE value
         * @property {number} LICENSE_MISMATCH=3 LICENSE_MISMATCH value
         * @property {number} LICENSE_OVERUSE=4 LICENSE_OVERUSE value
         */
        PunchHoleResponse.Failure = (function() {
            const valuesById = $Object.create(null), values = $Object.create(valuesById);
            values[valuesById[0] = "ID_NOT_EXIST"] = 0;
            values[valuesById[2] = "OFFLINE"] = 2;
            values[valuesById[3] = "LICENSE_MISMATCH"] = 3;
            values[valuesById[4] = "LICENSE_OVERUSE"] = 4;
            return values;
        })();

        return PunchHoleResponse;
    })();

    hbb.ConfigUpdate = (function() {

        /**
         * Properties of a ConfigUpdate.
         * @typedef {Object} hbb.ConfigUpdate.$Properties
         * @property {number|null} [serial] ConfigUpdate serial
         * @property {Array.<string>|null} [rendezvousServers] ConfigUpdate rendezvousServers
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a ConfigUpdate.
         * @memberof hbb
         * @interface IConfigUpdate
         * @augments hbb.ConfigUpdate.$Properties
         * @deprecated Use hbb.ConfigUpdate.$Properties instead.
         */

        /**
         * Shape of a ConfigUpdate.
         * @typedef {hbb.ConfigUpdate.$Properties} hbb.ConfigUpdate.$Shape
         */

        /**
         * Constructs a new ConfigUpdate.
         * @memberof hbb
         * @classdesc Represents a ConfigUpdate.
         * @constructor
         * @param {hbb.ConfigUpdate.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const ConfigUpdate = function (properties) {
            this.rendezvousServers = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * ConfigUpdate serial.
         * @member {number} serial
         * @memberof hbb.ConfigUpdate
         * @instance
         */
        ConfigUpdate.prototype.serial = 0;

        /**
         * ConfigUpdate rendezvousServers.
         * @member {Array.<string>} rendezvousServers
         * @memberof hbb.ConfigUpdate
         * @instance
         */
        ConfigUpdate.prototype.rendezvousServers = $util.emptyArray;

        /**
         * Creates a new ConfigUpdate instance using the specified properties.
         * @function create
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {hbb.ConfigUpdate.$Properties=} [properties] Properties to set
         * @returns {hbb.ConfigUpdate} ConfigUpdate instance
         * @type {{
         *   (properties: hbb.ConfigUpdate.$Shape): hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape;
         *   (properties?: hbb.ConfigUpdate.$Properties): hbb.ConfigUpdate;
         * }}
         */
        ConfigUpdate.create = function(properties) {
            return new ConfigUpdate(properties);
        };

        /**
         * Encodes the specified ConfigUpdate message. Does not implicitly {@link hbb.ConfigUpdate.verify|verify} messages.
         * @function encode
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {hbb.ConfigUpdate.$Properties} message ConfigUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ConfigUpdate.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial") && message.serial !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.serial);
            if (message.rendezvousServers != null && message.rendezvousServers.length)
                for (let i = 0; i < message.rendezvousServers.length; ++i)
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.rendezvousServers[i]);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified ConfigUpdate message, length delimited. Does not implicitly {@link hbb.ConfigUpdate.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {hbb.ConfigUpdate.$Properties} message ConfigUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ConfigUpdate.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a ConfigUpdate message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape} ConfigUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ConfigUpdate.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.ConfigUpdate();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.serial = value;
                        else
                            delete message.serial;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if (!(message.rendezvousServers && message.rendezvousServers.length))
                            message.rendezvousServers = [];
                        message.rendezvousServers.push(reader.stringVerify());
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a ConfigUpdate message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.ConfigUpdate & hbb.ConfigUpdate.$Shape} ConfigUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ConfigUpdate.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a ConfigUpdate message.
         * @function verify
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        ConfigUpdate.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial"))
                if (!$util.isInteger(message.serial))
                    return "serial: integer expected";
            if (message.rendezvousServers != null && $Object.hasOwnProperty.call(message, "rendezvousServers")) {
                if (!$Array.isArray(message.rendezvousServers))
                    return "rendezvousServers: array expected";
                for (let i = 0; i < message.rendezvousServers.length; ++i)
                    if (!$util.isString(message.rendezvousServers[i]))
                        return "rendezvousServers: string[] expected";
            }
            return null;
        };

        /**
         * Creates a ConfigUpdate message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.ConfigUpdate} ConfigUpdate
         */
        ConfigUpdate.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.ConfigUpdate)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.ConfigUpdate: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.ConfigUpdate();
            if (object.serial != null)
                if ($Number(object.serial) !== 0)
                    message.serial = object.serial | 0;
            if (object.rendezvousServers) {
                if (!$Array.isArray(object.rendezvousServers))
                    throw $TypeError(".hbb.ConfigUpdate.rendezvousServers: array expected");
                message.rendezvousServers = $Array(object.rendezvousServers.length);
                for (let i = 0; i < object.rendezvousServers.length; ++i)
                    message.rendezvousServers[i] = $String(object.rendezvousServers[i]);
            }
            return message;
        };

        /**
         * Creates a plain object from a ConfigUpdate message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {hbb.ConfigUpdate} message ConfigUpdate
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        ConfigUpdate.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults)
                object.rendezvousServers = [];
            if (options.defaults)
                object.serial = 0;
            if (message.serial != null && $Object.hasOwnProperty.call(message, "serial"))
                object.serial = message.serial;
            if (message.rendezvousServers && message.rendezvousServers.length) {
                object.rendezvousServers = $Array(message.rendezvousServers.length);
                for (let j = 0; j < message.rendezvousServers.length; ++j)
                    object.rendezvousServers[j] = message.rendezvousServers[j];
            }
            return object;
        };

        /**
         * Converts this ConfigUpdate to JSON.
         * @function toJSON
         * @memberof hbb.ConfigUpdate
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        ConfigUpdate.prototype.toJSON = function() {
            return ConfigUpdate.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for ConfigUpdate
         * @function getTypeUrl
         * @memberof hbb.ConfigUpdate
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        ConfigUpdate.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.ConfigUpdate";
        };

        return ConfigUpdate;
    })();

    hbb.RequestRelay = (function() {

        /**
         * Properties of a RequestRelay.
         * @typedef {Object} hbb.RequestRelay.$Properties
         * @property {string|null} [id] RequestRelay id
         * @property {string|null} [uuid] RequestRelay uuid
         * @property {Uint8Array|null} [socketAddr] RequestRelay socketAddr
         * @property {string|null} [relayServer] RequestRelay relayServer
         * @property {boolean|null} [secure] RequestRelay secure
         * @property {string|null} [licenceKey] RequestRelay licenceKey
         * @property {hbb.ConnType|null} [connType] RequestRelay connType
         * @property {string|null} [token] RequestRelay token
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a RequestRelay.
         * @memberof hbb
         * @interface IRequestRelay
         * @augments hbb.RequestRelay.$Properties
         * @deprecated Use hbb.RequestRelay.$Properties instead.
         */

        /**
         * Shape of a RequestRelay.
         * @typedef {hbb.RequestRelay.$Properties} hbb.RequestRelay.$Shape
         */

        /**
         * Constructs a new RequestRelay.
         * @memberof hbb
         * @classdesc Represents a RequestRelay.
         * @constructor
         * @param {hbb.RequestRelay.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const RequestRelay = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * RequestRelay id.
         * @member {string} id
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.id = "";

        /**
         * RequestRelay uuid.
         * @member {string} uuid
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.uuid = "";

        /**
         * RequestRelay socketAddr.
         * @member {Uint8Array} socketAddr
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.socketAddr = $util.newBuffer([]);

        /**
         * RequestRelay relayServer.
         * @member {string} relayServer
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.relayServer = "";

        /**
         * RequestRelay secure.
         * @member {boolean} secure
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.secure = false;

        /**
         * RequestRelay licenceKey.
         * @member {string} licenceKey
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.licenceKey = "";

        /**
         * RequestRelay connType.
         * @member {hbb.ConnType} connType
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.connType = 0;

        /**
         * RequestRelay token.
         * @member {string} token
         * @memberof hbb.RequestRelay
         * @instance
         */
        RequestRelay.prototype.token = "";

        /**
         * Creates a new RequestRelay instance using the specified properties.
         * @function create
         * @memberof hbb.RequestRelay
         * @static
         * @param {hbb.RequestRelay.$Properties=} [properties] Properties to set
         * @returns {hbb.RequestRelay} RequestRelay instance
         * @type {{
         *   (properties: hbb.RequestRelay.$Shape): hbb.RequestRelay & hbb.RequestRelay.$Shape;
         *   (properties?: hbb.RequestRelay.$Properties): hbb.RequestRelay;
         * }}
         */
        RequestRelay.create = function(properties) {
            return new RequestRelay(properties);
        };

        /**
         * Encodes the specified RequestRelay message. Does not implicitly {@link hbb.RequestRelay.verify|verify} messages.
         * @function encode
         * @memberof hbb.RequestRelay
         * @static
         * @param {hbb.RequestRelay.$Properties} message RequestRelay message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RequestRelay.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid") && message.uuid !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.uuid);
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr") && message.socketAddr.length)
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.socketAddr);
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer") && message.relayServer !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.relayServer);
            if (message.secure != null && $Object.hasOwnProperty.call(message, "secure") && message.secure !== false)
                writer.uint32(/* id 5, wireType 0 =*/40).bool(message.secure);
            if (message.licenceKey != null && $Object.hasOwnProperty.call(message, "licenceKey") && message.licenceKey !== "")
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.licenceKey);
            if (message.connType != null && $Object.hasOwnProperty.call(message, "connType") && message.connType !== 0)
                writer.uint32(/* id 7, wireType 0 =*/56).int32(message.connType);
            if (message.token != null && $Object.hasOwnProperty.call(message, "token") && message.token !== "")
                writer.uint32(/* id 8, wireType 2 =*/66).string(message.token);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified RequestRelay message, length delimited. Does not implicitly {@link hbb.RequestRelay.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.RequestRelay
         * @static
         * @param {hbb.RequestRelay.$Properties} message RequestRelay message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RequestRelay.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a RequestRelay message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.RequestRelay
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.RequestRelay & hbb.RequestRelay.$Shape} RequestRelay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RequestRelay.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.RequestRelay();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.uuid = value;
                        else
                            delete message.uuid;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddr = value;
                        else
                            delete message.socketAddr;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relayServer = value;
                        else
                            delete message.relayServer;
                        continue;
                    }
                case 5: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.secure = value;
                        else
                            delete message.secure;
                        continue;
                    }
                case 6: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.licenceKey = value;
                        else
                            delete message.licenceKey;
                        continue;
                    }
                case 7: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.connType = value;
                        else
                            delete message.connType;
                        continue;
                    }
                case 8: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.token = value;
                        else
                            delete message.token;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a RequestRelay message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.RequestRelay
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.RequestRelay & hbb.RequestRelay.$Shape} RequestRelay
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RequestRelay.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a RequestRelay message.
         * @function verify
         * @memberof hbb.RequestRelay
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        RequestRelay.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid"))
                if (!$util.isString(message.uuid))
                    return "uuid: string expected";
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                if (!(message.socketAddr && typeof message.socketAddr.length === "number" || $util.isString(message.socketAddr)))
                    return "socketAddr: buffer expected";
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                if (!$util.isString(message.relayServer))
                    return "relayServer: string expected";
            if (message.secure != null && $Object.hasOwnProperty.call(message, "secure"))
                if (typeof message.secure !== "boolean")
                    return "secure: boolean expected";
            if (message.licenceKey != null && $Object.hasOwnProperty.call(message, "licenceKey"))
                if (!$util.isString(message.licenceKey))
                    return "licenceKey: string expected";
            if (message.connType != null && $Object.hasOwnProperty.call(message, "connType"))
                if (typeof message.connType !== "number" || (message.connType | 0) !== message.connType)
                    return "connType: enum value expected";
            if (message.token != null && $Object.hasOwnProperty.call(message, "token"))
                if (!$util.isString(message.token))
                    return "token: string expected";
            return null;
        };

        /**
         * Creates a RequestRelay message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.RequestRelay
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.RequestRelay} RequestRelay
         */
        RequestRelay.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.RequestRelay)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.RequestRelay: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.RequestRelay();
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.uuid != null)
                if (typeof object.uuid !== "string" || object.uuid.length)
                    message.uuid = $String(object.uuid);
            if (object.socketAddr != null)
                if (object.socketAddr.length)
                    if (typeof object.socketAddr === "string")
                        $util.base64.decode(object.socketAddr, message.socketAddr = $util.newBuffer($util.base64.length(object.socketAddr)), 0);
                    else if (object.socketAddr.length >= 0)
                        message.socketAddr = object.socketAddr;
            if (object.relayServer != null)
                if (typeof object.relayServer !== "string" || object.relayServer.length)
                    message.relayServer = $String(object.relayServer);
            if (object.secure != null)
                if (object.secure)
                    message.secure = $Boolean(object.secure);
            if (object.licenceKey != null)
                if (typeof object.licenceKey !== "string" || object.licenceKey.length)
                    message.licenceKey = $String(object.licenceKey);
            if (object.connType !== 0 && (typeof object.connType !== "string" || $root.hbb.ConnType[object.connType] !== 0))
                switch (object.connType) {
                case "DEFAULT_CONN":
                case 0:
                    message.connType = 0;
                    break;
                case "FILE_TRANSFER":
                case 1:
                    message.connType = 1;
                    break;
                case "PORT_FORWARD":
                case 2:
                    message.connType = 2;
                    break;
                case "RDP":
                case 3:
                    message.connType = 3;
                    break;
                case "VIEW_CAMERA":
                case 4:
                    message.connType = 4;
                    break;
                case "TERMINAL":
                case 5:
                    message.connType = 5;
                    break;
                default:
                    if (typeof object.connType === "number" && (object.connType | 0) === object.connType)
                        message.connType = object.connType;
                }
            if (object.token != null)
                if (typeof object.token !== "string" || object.token.length)
                    message.token = $String(object.token);
            return message;
        };

        /**
         * Creates a plain object from a RequestRelay message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.RequestRelay
         * @static
         * @param {hbb.RequestRelay} message RequestRelay
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        RequestRelay.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.id = "";
                object.uuid = "";
                if (options.bytes === $String)
                    object.socketAddr = "";
                else {
                    object.socketAddr = [];
                    if (options.bytes !== $Array)
                        object.socketAddr = $util.newBuffer(object.socketAddr);
                }
                object.relayServer = "";
                object.secure = false;
                object.licenceKey = "";
                object.connType = options.enums === $String ? "DEFAULT_CONN" : 0;
                object.token = "";
            }
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid"))
                object.uuid = message.uuid;
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                object.socketAddr = options.bytes === $String ? $util.base64.encode(message.socketAddr, 0, message.socketAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddr) : message.socketAddr;
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                object.relayServer = message.relayServer;
            if (message.secure != null && $Object.hasOwnProperty.call(message, "secure"))
                object.secure = message.secure;
            if (message.licenceKey != null && $Object.hasOwnProperty.call(message, "licenceKey"))
                object.licenceKey = message.licenceKey;
            if (message.connType != null && $Object.hasOwnProperty.call(message, "connType"))
                object.connType = options.enums === $String ? $root.hbb.ConnType[message.connType] === $undefined ? message.connType : $root.hbb.ConnType[message.connType] : message.connType;
            if (message.token != null && $Object.hasOwnProperty.call(message, "token"))
                object.token = message.token;
            return object;
        };

        /**
         * Converts this RequestRelay to JSON.
         * @function toJSON
         * @memberof hbb.RequestRelay
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        RequestRelay.prototype.toJSON = function() {
            return RequestRelay.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for RequestRelay
         * @function getTypeUrl
         * @memberof hbb.RequestRelay
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        RequestRelay.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.RequestRelay";
        };

        return RequestRelay;
    })();

    hbb.RelayResponse = (function() {

        /**
         * Properties of a RelayResponse.
         * @typedef {Object} hbb.RelayResponse.$Properties
         * @property {Uint8Array|null} [socketAddr] RelayResponse socketAddr
         * @property {string|null} [uuid] RelayResponse uuid
         * @property {string|null} [relayServer] RelayResponse relayServer
         * @property {string|null} [id] RelayResponse id
         * @property {Uint8Array|null} [pk] RelayResponse pk
         * @property {string|null} [refuseReason] RelayResponse refuseReason
         * @property {string|null} [version] RelayResponse version
         * @property {number|null} [feedback] RelayResponse feedback
         * @property {Uint8Array|null} [socketAddrV6] RelayResponse socketAddrV6
         * @property {number|null} [upnpPort] RelayResponse upnpPort
         * @property {"id"|"pk"} [union] RelayResponse union
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a RelayResponse.
         * @memberof hbb
         * @interface IRelayResponse
         * @augments hbb.RelayResponse.$Properties
         * @deprecated Use hbb.RelayResponse.$Properties instead.
         */

        /**
         * Narrowed shape of a RelayResponse.
         * @typedef {{
         *   socketAddr?: Uint8Array|null;
         *   uuid?: string|null;
         *   relayServer?: string|null;
         *   id?: string|null;
         *   pk?: Uint8Array|null;
         *   refuseReason?: string|null;
         *   version?: string|null;
         *   feedback?: number|null;
         *   socketAddrV6?: Uint8Array|null;
         *   upnpPort?: number|null;
         *   $unknowns?: Array.<Uint8Array>;
         * } & (
         *   ({ union?: undefined; id?: null; pk?: null }|{ union?: "id"; id: string; pk?: null }|{ union?: "pk"; id?: null; pk: Uint8Array })
         * )} hbb.RelayResponse.$Shape
         */

        /**
         * Constructs a new RelayResponse.
         * @memberof hbb
         * @classdesc Represents a RelayResponse.
         * @constructor
         * @param {hbb.RelayResponse.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const RelayResponse = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * RelayResponse socketAddr.
         * @member {Uint8Array} socketAddr
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.socketAddr = $util.newBuffer([]);

        /**
         * RelayResponse uuid.
         * @member {string} uuid
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.uuid = "";

        /**
         * RelayResponse relayServer.
         * @member {string} relayServer
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.relayServer = "";

        /**
         * RelayResponse id.
         * @member {string|null|undefined} id
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.id = null;

        /**
         * RelayResponse pk.
         * @member {Uint8Array|null|undefined} pk
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.pk = null;

        /**
         * RelayResponse refuseReason.
         * @member {string} refuseReason
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.refuseReason = "";

        /**
         * RelayResponse version.
         * @member {string} version
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.version = "";

        /**
         * RelayResponse feedback.
         * @member {number} feedback
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.feedback = 0;

        /**
         * RelayResponse socketAddrV6.
         * @member {Uint8Array} socketAddrV6
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.socketAddrV6 = $util.newBuffer([]);

        /**
         * RelayResponse upnpPort.
         * @member {number} upnpPort
         * @memberof hbb.RelayResponse
         * @instance
         */
        RelayResponse.prototype.upnpPort = 0;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * RelayResponse union.
         * @member {"id"|"pk"|undefined} union
         * @memberof hbb.RelayResponse
         * @instance
         */
        $Object.defineProperty(RelayResponse.prototype, "union", {
            get: $util.oneOfGetter($oneOfFields = ["id", "pk"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new RelayResponse instance using the specified properties.
         * @function create
         * @memberof hbb.RelayResponse
         * @static
         * @param {hbb.RelayResponse.$Properties=} [properties] Properties to set
         * @returns {hbb.RelayResponse} RelayResponse instance
         * @type {{
         *   (properties: hbb.RelayResponse.$Shape): hbb.RelayResponse & hbb.RelayResponse.$Shape;
         *   (properties?: hbb.RelayResponse.$Properties): hbb.RelayResponse;
         * }}
         */
        RelayResponse.create = function(properties) {
            return new RelayResponse(properties);
        };

        /**
         * Encodes the specified RelayResponse message. Does not implicitly {@link hbb.RelayResponse.verify|verify} messages.
         * @function encode
         * @memberof hbb.RelayResponse
         * @static
         * @param {hbb.RelayResponse.$Properties} message RelayResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RelayResponse.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr") && message.socketAddr.length)
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.socketAddr);
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid") && message.uuid !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.uuid);
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer") && message.relayServer !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.relayServer);
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.id);
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk"))
                writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.pk);
            if (message.refuseReason != null && $Object.hasOwnProperty.call(message, "refuseReason") && message.refuseReason !== "")
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.refuseReason);
            if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== "")
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.version);
            if (message.feedback != null && $Object.hasOwnProperty.call(message, "feedback") && message.feedback !== 0)
                writer.uint32(/* id 9, wireType 0 =*/72).int32(message.feedback);
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6") && message.socketAddrV6.length)
                writer.uint32(/* id 10, wireType 2 =*/82).bytes(message.socketAddrV6);
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort") && message.upnpPort !== 0)
                writer.uint32(/* id 11, wireType 0 =*/88).int32(message.upnpPort);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified RelayResponse message, length delimited. Does not implicitly {@link hbb.RelayResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.RelayResponse
         * @static
         * @param {hbb.RelayResponse.$Properties} message RelayResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RelayResponse.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a RelayResponse message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.RelayResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.RelayResponse & hbb.RelayResponse.$Shape} RelayResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RelayResponse.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.RelayResponse();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddr = value;
                        else
                            delete message.socketAddr;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.uuid = value;
                        else
                            delete message.uuid;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relayServer = value;
                        else
                            delete message.relayServer;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        message.id = reader.stringVerify();
                        message.union = "id";
                        continue;
                    }
                case 5: {
                        if (wireType !== 2)
                            break;
                        message.pk = reader.bytes();
                        message.union = "pk";
                        continue;
                    }
                case 6: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.refuseReason = value;
                        else
                            delete message.refuseReason;
                        continue;
                    }
                case 7: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.version = value;
                        else
                            delete message.version;
                        continue;
                    }
                case 9: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.feedback = value;
                        else
                            delete message.feedback;
                        continue;
                    }
                case 10: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddrV6 = value;
                        else
                            delete message.socketAddrV6;
                        continue;
                    }
                case 11: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.upnpPort = value;
                        else
                            delete message.upnpPort;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a RelayResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.RelayResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.RelayResponse & hbb.RelayResponse.$Shape} RelayResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RelayResponse.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a RelayResponse message.
         * @function verify
         * @memberof hbb.RelayResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        RelayResponse.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            let properties = {};
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                if (!(message.socketAddr && typeof message.socketAddr.length === "number" || $util.isString(message.socketAddr)))
                    return "socketAddr: buffer expected";
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid"))
                if (!$util.isString(message.uuid))
                    return "uuid: string expected";
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                if (!$util.isString(message.relayServer))
                    return "relayServer: string expected";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id")) {
                properties.union = 1;
                if (!$util.isString(message.id))
                    return "id: string expected";
            }
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                if (!(message.pk && typeof message.pk.length === "number" || $util.isString(message.pk)))
                    return "pk: buffer expected";
            }
            if (message.refuseReason != null && $Object.hasOwnProperty.call(message, "refuseReason"))
                if (!$util.isString(message.refuseReason))
                    return "refuseReason: string expected";
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                if (!$util.isString(message.version))
                    return "version: string expected";
            if (message.feedback != null && $Object.hasOwnProperty.call(message, "feedback"))
                if (!$util.isInteger(message.feedback))
                    return "feedback: integer expected";
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                if (!(message.socketAddrV6 && typeof message.socketAddrV6.length === "number" || $util.isString(message.socketAddrV6)))
                    return "socketAddrV6: buffer expected";
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                if (!$util.isInteger(message.upnpPort))
                    return "upnpPort: integer expected";
            return null;
        };

        /**
         * Creates a RelayResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.RelayResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.RelayResponse} RelayResponse
         */
        RelayResponse.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.RelayResponse)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.RelayResponse: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.RelayResponse();
            if (object.socketAddr != null)
                if (object.socketAddr.length)
                    if (typeof object.socketAddr === "string")
                        $util.base64.decode(object.socketAddr, message.socketAddr = $util.newBuffer($util.base64.length(object.socketAddr)), 0);
                    else if (object.socketAddr.length >= 0)
                        message.socketAddr = object.socketAddr;
            if (object.uuid != null)
                if (typeof object.uuid !== "string" || object.uuid.length)
                    message.uuid = $String(object.uuid);
            if (object.relayServer != null)
                if (typeof object.relayServer !== "string" || object.relayServer.length)
                    message.relayServer = $String(object.relayServer);
            if (object.id != null)
                message.id = $String(object.id);
            if (object.pk != null)
                if (typeof object.pk === "string")
                    $util.base64.decode(object.pk, message.pk = $util.newBuffer($util.base64.length(object.pk)), 0);
                else if (object.pk.length >= 0)
                    message.pk = object.pk;
            if (object.refuseReason != null)
                if (typeof object.refuseReason !== "string" || object.refuseReason.length)
                    message.refuseReason = $String(object.refuseReason);
            if (object.version != null)
                if (typeof object.version !== "string" || object.version.length)
                    message.version = $String(object.version);
            if (object.feedback != null)
                if ($Number(object.feedback) !== 0)
                    message.feedback = object.feedback | 0;
            if (object.socketAddrV6 != null)
                if (object.socketAddrV6.length)
                    if (typeof object.socketAddrV6 === "string")
                        $util.base64.decode(object.socketAddrV6, message.socketAddrV6 = $util.newBuffer($util.base64.length(object.socketAddrV6)), 0);
                    else if (object.socketAddrV6.length >= 0)
                        message.socketAddrV6 = object.socketAddrV6;
            if (object.upnpPort != null)
                if ($Number(object.upnpPort) !== 0)
                    message.upnpPort = object.upnpPort | 0;
            return message;
        };

        /**
         * Creates a plain object from a RelayResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.RelayResponse
         * @static
         * @param {hbb.RelayResponse} message RelayResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        RelayResponse.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                if (options.bytes === $String)
                    object.socketAddr = "";
                else {
                    object.socketAddr = [];
                    if (options.bytes !== $Array)
                        object.socketAddr = $util.newBuffer(object.socketAddr);
                }
                object.uuid = "";
                object.relayServer = "";
                object.refuseReason = "";
                object.version = "";
                object.feedback = 0;
                if (options.bytes === $String)
                    object.socketAddrV6 = "";
                else {
                    object.socketAddrV6 = [];
                    if (options.bytes !== $Array)
                        object.socketAddrV6 = $util.newBuffer(object.socketAddrV6);
                }
                object.upnpPort = 0;
            }
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                object.socketAddr = options.bytes === $String ? $util.base64.encode(message.socketAddr, 0, message.socketAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddr) : message.socketAddr;
            if (message.uuid != null && $Object.hasOwnProperty.call(message, "uuid"))
                object.uuid = message.uuid;
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                object.relayServer = message.relayServer;
            if (message.id != null && $Object.hasOwnProperty.call(message, "id")) {
                object.id = message.id;
                if (options.oneofs)
                    object.union = "id";
            }
            if (message.pk != null && $Object.hasOwnProperty.call(message, "pk")) {
                object.pk = options.bytes === $String ? $util.base64.encode(message.pk, 0, message.pk.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.pk) : message.pk;
                if (options.oneofs)
                    object.union = "pk";
            }
            if (message.refuseReason != null && $Object.hasOwnProperty.call(message, "refuseReason"))
                object.refuseReason = message.refuseReason;
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                object.version = message.version;
            if (message.feedback != null && $Object.hasOwnProperty.call(message, "feedback"))
                object.feedback = message.feedback;
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                object.socketAddrV6 = options.bytes === $String ? $util.base64.encode(message.socketAddrV6, 0, message.socketAddrV6.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddrV6) : message.socketAddrV6;
            if (message.upnpPort != null && $Object.hasOwnProperty.call(message, "upnpPort"))
                object.upnpPort = message.upnpPort;
            return object;
        };

        /**
         * Converts this RelayResponse to JSON.
         * @function toJSON
         * @memberof hbb.RelayResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        RelayResponse.prototype.toJSON = function() {
            return RelayResponse.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for RelayResponse
         * @function getTypeUrl
         * @memberof hbb.RelayResponse
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        RelayResponse.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.RelayResponse";
        };

        return RelayResponse;
    })();

    hbb.SoftwareUpdate = (function() {

        /**
         * Properties of a SoftwareUpdate.
         * @typedef {Object} hbb.SoftwareUpdate.$Properties
         * @property {string|null} [url] SoftwareUpdate url
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a SoftwareUpdate.
         * @memberof hbb
         * @interface ISoftwareUpdate
         * @augments hbb.SoftwareUpdate.$Properties
         * @deprecated Use hbb.SoftwareUpdate.$Properties instead.
         */

        /**
         * Shape of a SoftwareUpdate.
         * @typedef {hbb.SoftwareUpdate.$Properties} hbb.SoftwareUpdate.$Shape
         */

        /**
         * Constructs a new SoftwareUpdate.
         * @memberof hbb
         * @classdesc Represents a SoftwareUpdate.
         * @constructor
         * @param {hbb.SoftwareUpdate.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const SoftwareUpdate = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * SoftwareUpdate url.
         * @member {string} url
         * @memberof hbb.SoftwareUpdate
         * @instance
         */
        SoftwareUpdate.prototype.url = "";

        /**
         * Creates a new SoftwareUpdate instance using the specified properties.
         * @function create
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {hbb.SoftwareUpdate.$Properties=} [properties] Properties to set
         * @returns {hbb.SoftwareUpdate} SoftwareUpdate instance
         * @type {{
         *   (properties: hbb.SoftwareUpdate.$Shape): hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape;
         *   (properties?: hbb.SoftwareUpdate.$Properties): hbb.SoftwareUpdate;
         * }}
         */
        SoftwareUpdate.create = function(properties) {
            return new SoftwareUpdate(properties);
        };

        /**
         * Encodes the specified SoftwareUpdate message. Does not implicitly {@link hbb.SoftwareUpdate.verify|verify} messages.
         * @function encode
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {hbb.SoftwareUpdate.$Properties} message SoftwareUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SoftwareUpdate.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.url != null && $Object.hasOwnProperty.call(message, "url") && message.url !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.url);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified SoftwareUpdate message, length delimited. Does not implicitly {@link hbb.SoftwareUpdate.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {hbb.SoftwareUpdate.$Properties} message SoftwareUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SoftwareUpdate.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a SoftwareUpdate message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape} SoftwareUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SoftwareUpdate.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.SoftwareUpdate();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.url = value;
                        else
                            delete message.url;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a SoftwareUpdate message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.SoftwareUpdate & hbb.SoftwareUpdate.$Shape} SoftwareUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SoftwareUpdate.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a SoftwareUpdate message.
         * @function verify
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        SoftwareUpdate.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.url != null && $Object.hasOwnProperty.call(message, "url"))
                if (!$util.isString(message.url))
                    return "url: string expected";
            return null;
        };

        /**
         * Creates a SoftwareUpdate message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.SoftwareUpdate} SoftwareUpdate
         */
        SoftwareUpdate.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.SoftwareUpdate)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.SoftwareUpdate: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.SoftwareUpdate();
            if (object.url != null)
                if (typeof object.url !== "string" || object.url.length)
                    message.url = $String(object.url);
            return message;
        };

        /**
         * Creates a plain object from a SoftwareUpdate message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {hbb.SoftwareUpdate} message SoftwareUpdate
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        SoftwareUpdate.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults)
                object.url = "";
            if (message.url != null && $Object.hasOwnProperty.call(message, "url"))
                object.url = message.url;
            return object;
        };

        /**
         * Converts this SoftwareUpdate to JSON.
         * @function toJSON
         * @memberof hbb.SoftwareUpdate
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        SoftwareUpdate.prototype.toJSON = function() {
            return SoftwareUpdate.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for SoftwareUpdate
         * @function getTypeUrl
         * @memberof hbb.SoftwareUpdate
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        SoftwareUpdate.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.SoftwareUpdate";
        };

        return SoftwareUpdate;
    })();

    hbb.FetchLocalAddr = (function() {

        /**
         * Properties of a FetchLocalAddr.
         * @typedef {Object} hbb.FetchLocalAddr.$Properties
         * @property {Uint8Array|null} [socketAddr] FetchLocalAddr socketAddr
         * @property {string|null} [relayServer] FetchLocalAddr relayServer
         * @property {Uint8Array|null} [socketAddrV6] FetchLocalAddr socketAddrV6
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a FetchLocalAddr.
         * @memberof hbb
         * @interface IFetchLocalAddr
         * @augments hbb.FetchLocalAddr.$Properties
         * @deprecated Use hbb.FetchLocalAddr.$Properties instead.
         */

        /**
         * Shape of a FetchLocalAddr.
         * @typedef {hbb.FetchLocalAddr.$Properties} hbb.FetchLocalAddr.$Shape
         */

        /**
         * Constructs a new FetchLocalAddr.
         * @memberof hbb
         * @classdesc Represents a FetchLocalAddr.
         * @constructor
         * @param {hbb.FetchLocalAddr.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const FetchLocalAddr = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * FetchLocalAddr socketAddr.
         * @member {Uint8Array} socketAddr
         * @memberof hbb.FetchLocalAddr
         * @instance
         */
        FetchLocalAddr.prototype.socketAddr = $util.newBuffer([]);

        /**
         * FetchLocalAddr relayServer.
         * @member {string} relayServer
         * @memberof hbb.FetchLocalAddr
         * @instance
         */
        FetchLocalAddr.prototype.relayServer = "";

        /**
         * FetchLocalAddr socketAddrV6.
         * @member {Uint8Array} socketAddrV6
         * @memberof hbb.FetchLocalAddr
         * @instance
         */
        FetchLocalAddr.prototype.socketAddrV6 = $util.newBuffer([]);

        /**
         * Creates a new FetchLocalAddr instance using the specified properties.
         * @function create
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {hbb.FetchLocalAddr.$Properties=} [properties] Properties to set
         * @returns {hbb.FetchLocalAddr} FetchLocalAddr instance
         * @type {{
         *   (properties: hbb.FetchLocalAddr.$Shape): hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape;
         *   (properties?: hbb.FetchLocalAddr.$Properties): hbb.FetchLocalAddr;
         * }}
         */
        FetchLocalAddr.create = function(properties) {
            return new FetchLocalAddr(properties);
        };

        /**
         * Encodes the specified FetchLocalAddr message. Does not implicitly {@link hbb.FetchLocalAddr.verify|verify} messages.
         * @function encode
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {hbb.FetchLocalAddr.$Properties} message FetchLocalAddr message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FetchLocalAddr.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr") && message.socketAddr.length)
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.socketAddr);
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer") && message.relayServer !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.relayServer);
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6") && message.socketAddrV6.length)
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.socketAddrV6);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified FetchLocalAddr message, length delimited. Does not implicitly {@link hbb.FetchLocalAddr.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {hbb.FetchLocalAddr.$Properties} message FetchLocalAddr message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FetchLocalAddr.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a FetchLocalAddr message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape} FetchLocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FetchLocalAddr.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.FetchLocalAddr();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddr = value;
                        else
                            delete message.socketAddr;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relayServer = value;
                        else
                            delete message.relayServer;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddrV6 = value;
                        else
                            delete message.socketAddrV6;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a FetchLocalAddr message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.FetchLocalAddr & hbb.FetchLocalAddr.$Shape} FetchLocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FetchLocalAddr.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a FetchLocalAddr message.
         * @function verify
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        FetchLocalAddr.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                if (!(message.socketAddr && typeof message.socketAddr.length === "number" || $util.isString(message.socketAddr)))
                    return "socketAddr: buffer expected";
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                if (!$util.isString(message.relayServer))
                    return "relayServer: string expected";
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                if (!(message.socketAddrV6 && typeof message.socketAddrV6.length === "number" || $util.isString(message.socketAddrV6)))
                    return "socketAddrV6: buffer expected";
            return null;
        };

        /**
         * Creates a FetchLocalAddr message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.FetchLocalAddr} FetchLocalAddr
         */
        FetchLocalAddr.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.FetchLocalAddr)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.FetchLocalAddr: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.FetchLocalAddr();
            if (object.socketAddr != null)
                if (object.socketAddr.length)
                    if (typeof object.socketAddr === "string")
                        $util.base64.decode(object.socketAddr, message.socketAddr = $util.newBuffer($util.base64.length(object.socketAddr)), 0);
                    else if (object.socketAddr.length >= 0)
                        message.socketAddr = object.socketAddr;
            if (object.relayServer != null)
                if (typeof object.relayServer !== "string" || object.relayServer.length)
                    message.relayServer = $String(object.relayServer);
            if (object.socketAddrV6 != null)
                if (object.socketAddrV6.length)
                    if (typeof object.socketAddrV6 === "string")
                        $util.base64.decode(object.socketAddrV6, message.socketAddrV6 = $util.newBuffer($util.base64.length(object.socketAddrV6)), 0);
                    else if (object.socketAddrV6.length >= 0)
                        message.socketAddrV6 = object.socketAddrV6;
            return message;
        };

        /**
         * Creates a plain object from a FetchLocalAddr message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {hbb.FetchLocalAddr} message FetchLocalAddr
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        FetchLocalAddr.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                if (options.bytes === $String)
                    object.socketAddr = "";
                else {
                    object.socketAddr = [];
                    if (options.bytes !== $Array)
                        object.socketAddr = $util.newBuffer(object.socketAddr);
                }
                object.relayServer = "";
                if (options.bytes === $String)
                    object.socketAddrV6 = "";
                else {
                    object.socketAddrV6 = [];
                    if (options.bytes !== $Array)
                        object.socketAddrV6 = $util.newBuffer(object.socketAddrV6);
                }
            }
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                object.socketAddr = options.bytes === $String ? $util.base64.encode(message.socketAddr, 0, message.socketAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddr) : message.socketAddr;
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                object.relayServer = message.relayServer;
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                object.socketAddrV6 = options.bytes === $String ? $util.base64.encode(message.socketAddrV6, 0, message.socketAddrV6.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddrV6) : message.socketAddrV6;
            return object;
        };

        /**
         * Converts this FetchLocalAddr to JSON.
         * @function toJSON
         * @memberof hbb.FetchLocalAddr
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        FetchLocalAddr.prototype.toJSON = function() {
            return FetchLocalAddr.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for FetchLocalAddr
         * @function getTypeUrl
         * @memberof hbb.FetchLocalAddr
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        FetchLocalAddr.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.FetchLocalAddr";
        };

        return FetchLocalAddr;
    })();

    hbb.LocalAddr = (function() {

        /**
         * Properties of a LocalAddr.
         * @typedef {Object} hbb.LocalAddr.$Properties
         * @property {Uint8Array|null} [socketAddr] LocalAddr socketAddr
         * @property {Uint8Array|null} [localAddr] LocalAddr localAddr
         * @property {string|null} [relayServer] LocalAddr relayServer
         * @property {string|null} [id] LocalAddr id
         * @property {string|null} [version] LocalAddr version
         * @property {Uint8Array|null} [socketAddrV6] LocalAddr socketAddrV6
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a LocalAddr.
         * @memberof hbb
         * @interface ILocalAddr
         * @augments hbb.LocalAddr.$Properties
         * @deprecated Use hbb.LocalAddr.$Properties instead.
         */

        /**
         * Shape of a LocalAddr.
         * @typedef {hbb.LocalAddr.$Properties} hbb.LocalAddr.$Shape
         */

        /**
         * Constructs a new LocalAddr.
         * @memberof hbb
         * @classdesc Represents a LocalAddr.
         * @constructor
         * @param {hbb.LocalAddr.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const LocalAddr = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * LocalAddr socketAddr.
         * @member {Uint8Array} socketAddr
         * @memberof hbb.LocalAddr
         * @instance
         */
        LocalAddr.prototype.socketAddr = $util.newBuffer([]);

        /**
         * LocalAddr localAddr.
         * @member {Uint8Array} localAddr
         * @memberof hbb.LocalAddr
         * @instance
         */
        LocalAddr.prototype.localAddr = $util.newBuffer([]);

        /**
         * LocalAddr relayServer.
         * @member {string} relayServer
         * @memberof hbb.LocalAddr
         * @instance
         */
        LocalAddr.prototype.relayServer = "";

        /**
         * LocalAddr id.
         * @member {string} id
         * @memberof hbb.LocalAddr
         * @instance
         */
        LocalAddr.prototype.id = "";

        /**
         * LocalAddr version.
         * @member {string} version
         * @memberof hbb.LocalAddr
         * @instance
         */
        LocalAddr.prototype.version = "";

        /**
         * LocalAddr socketAddrV6.
         * @member {Uint8Array} socketAddrV6
         * @memberof hbb.LocalAddr
         * @instance
         */
        LocalAddr.prototype.socketAddrV6 = $util.newBuffer([]);

        /**
         * Creates a new LocalAddr instance using the specified properties.
         * @function create
         * @memberof hbb.LocalAddr
         * @static
         * @param {hbb.LocalAddr.$Properties=} [properties] Properties to set
         * @returns {hbb.LocalAddr} LocalAddr instance
         * @type {{
         *   (properties: hbb.LocalAddr.$Shape): hbb.LocalAddr & hbb.LocalAddr.$Shape;
         *   (properties?: hbb.LocalAddr.$Properties): hbb.LocalAddr;
         * }}
         */
        LocalAddr.create = function(properties) {
            return new LocalAddr(properties);
        };

        /**
         * Encodes the specified LocalAddr message. Does not implicitly {@link hbb.LocalAddr.verify|verify} messages.
         * @function encode
         * @memberof hbb.LocalAddr
         * @static
         * @param {hbb.LocalAddr.$Properties} message LocalAddr message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LocalAddr.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr") && message.socketAddr.length)
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.socketAddr);
            if (message.localAddr != null && $Object.hasOwnProperty.call(message, "localAddr") && message.localAddr.length)
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.localAddr);
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer") && message.relayServer !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.relayServer);
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.id);
            if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== "")
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.version);
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6") && message.socketAddrV6.length)
                writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.socketAddrV6);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified LocalAddr message, length delimited. Does not implicitly {@link hbb.LocalAddr.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.LocalAddr
         * @static
         * @param {hbb.LocalAddr.$Properties} message LocalAddr message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LocalAddr.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a LocalAddr message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.LocalAddr
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.LocalAddr & hbb.LocalAddr.$Shape} LocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LocalAddr.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.LocalAddr();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddr = value;
                        else
                            delete message.socketAddr;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.localAddr = value;
                        else
                            delete message.localAddr;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relayServer = value;
                        else
                            delete message.relayServer;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 5: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.version = value;
                        else
                            delete message.version;
                        continue;
                    }
                case 6: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.socketAddrV6 = value;
                        else
                            delete message.socketAddrV6;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a LocalAddr message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.LocalAddr
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.LocalAddr & hbb.LocalAddr.$Shape} LocalAddr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LocalAddr.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a LocalAddr message.
         * @function verify
         * @memberof hbb.LocalAddr
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        LocalAddr.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                if (!(message.socketAddr && typeof message.socketAddr.length === "number" || $util.isString(message.socketAddr)))
                    return "socketAddr: buffer expected";
            if (message.localAddr != null && $Object.hasOwnProperty.call(message, "localAddr"))
                if (!(message.localAddr && typeof message.localAddr.length === "number" || $util.isString(message.localAddr)))
                    return "localAddr: buffer expected";
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                if (!$util.isString(message.relayServer))
                    return "relayServer: string expected";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                if (!$util.isString(message.version))
                    return "version: string expected";
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                if (!(message.socketAddrV6 && typeof message.socketAddrV6.length === "number" || $util.isString(message.socketAddrV6)))
                    return "socketAddrV6: buffer expected";
            return null;
        };

        /**
         * Creates a LocalAddr message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.LocalAddr
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.LocalAddr} LocalAddr
         */
        LocalAddr.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.LocalAddr)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.LocalAddr: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.LocalAddr();
            if (object.socketAddr != null)
                if (object.socketAddr.length)
                    if (typeof object.socketAddr === "string")
                        $util.base64.decode(object.socketAddr, message.socketAddr = $util.newBuffer($util.base64.length(object.socketAddr)), 0);
                    else if (object.socketAddr.length >= 0)
                        message.socketAddr = object.socketAddr;
            if (object.localAddr != null)
                if (object.localAddr.length)
                    if (typeof object.localAddr === "string")
                        $util.base64.decode(object.localAddr, message.localAddr = $util.newBuffer($util.base64.length(object.localAddr)), 0);
                    else if (object.localAddr.length >= 0)
                        message.localAddr = object.localAddr;
            if (object.relayServer != null)
                if (typeof object.relayServer !== "string" || object.relayServer.length)
                    message.relayServer = $String(object.relayServer);
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.version != null)
                if (typeof object.version !== "string" || object.version.length)
                    message.version = $String(object.version);
            if (object.socketAddrV6 != null)
                if (object.socketAddrV6.length)
                    if (typeof object.socketAddrV6 === "string")
                        $util.base64.decode(object.socketAddrV6, message.socketAddrV6 = $util.newBuffer($util.base64.length(object.socketAddrV6)), 0);
                    else if (object.socketAddrV6.length >= 0)
                        message.socketAddrV6 = object.socketAddrV6;
            return message;
        };

        /**
         * Creates a plain object from a LocalAddr message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.LocalAddr
         * @static
         * @param {hbb.LocalAddr} message LocalAddr
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        LocalAddr.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                if (options.bytes === $String)
                    object.socketAddr = "";
                else {
                    object.socketAddr = [];
                    if (options.bytes !== $Array)
                        object.socketAddr = $util.newBuffer(object.socketAddr);
                }
                if (options.bytes === $String)
                    object.localAddr = "";
                else {
                    object.localAddr = [];
                    if (options.bytes !== $Array)
                        object.localAddr = $util.newBuffer(object.localAddr);
                }
                object.relayServer = "";
                object.id = "";
                object.version = "";
                if (options.bytes === $String)
                    object.socketAddrV6 = "";
                else {
                    object.socketAddrV6 = [];
                    if (options.bytes !== $Array)
                        object.socketAddrV6 = $util.newBuffer(object.socketAddrV6);
                }
            }
            if (message.socketAddr != null && $Object.hasOwnProperty.call(message, "socketAddr"))
                object.socketAddr = options.bytes === $String ? $util.base64.encode(message.socketAddr, 0, message.socketAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddr) : message.socketAddr;
            if (message.localAddr != null && $Object.hasOwnProperty.call(message, "localAddr"))
                object.localAddr = options.bytes === $String ? $util.base64.encode(message.localAddr, 0, message.localAddr.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.localAddr) : message.localAddr;
            if (message.relayServer != null && $Object.hasOwnProperty.call(message, "relayServer"))
                object.relayServer = message.relayServer;
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                object.version = message.version;
            if (message.socketAddrV6 != null && $Object.hasOwnProperty.call(message, "socketAddrV6"))
                object.socketAddrV6 = options.bytes === $String ? $util.base64.encode(message.socketAddrV6, 0, message.socketAddrV6.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.socketAddrV6) : message.socketAddrV6;
            return object;
        };

        /**
         * Converts this LocalAddr to JSON.
         * @function toJSON
         * @memberof hbb.LocalAddr
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        LocalAddr.prototype.toJSON = function() {
            return LocalAddr.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for LocalAddr
         * @function getTypeUrl
         * @memberof hbb.LocalAddr
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        LocalAddr.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.LocalAddr";
        };

        return LocalAddr;
    })();

    hbb.PeerDiscovery = (function() {

        /**
         * Properties of a PeerDiscovery.
         * @typedef {Object} hbb.PeerDiscovery.$Properties
         * @property {string|null} [cmd] PeerDiscovery cmd
         * @property {string|null} [mac] PeerDiscovery mac
         * @property {string|null} [id] PeerDiscovery id
         * @property {string|null} [username] PeerDiscovery username
         * @property {string|null} [hostname] PeerDiscovery hostname
         * @property {string|null} [platform] PeerDiscovery platform
         * @property {string|null} [misc] PeerDiscovery misc
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a PeerDiscovery.
         * @memberof hbb
         * @interface IPeerDiscovery
         * @augments hbb.PeerDiscovery.$Properties
         * @deprecated Use hbb.PeerDiscovery.$Properties instead.
         */

        /**
         * Shape of a PeerDiscovery.
         * @typedef {hbb.PeerDiscovery.$Properties} hbb.PeerDiscovery.$Shape
         */

        /**
         * Constructs a new PeerDiscovery.
         * @memberof hbb
         * @classdesc Represents a PeerDiscovery.
         * @constructor
         * @param {hbb.PeerDiscovery.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const PeerDiscovery = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * PeerDiscovery cmd.
         * @member {string} cmd
         * @memberof hbb.PeerDiscovery
         * @instance
         */
        PeerDiscovery.prototype.cmd = "";

        /**
         * PeerDiscovery mac.
         * @member {string} mac
         * @memberof hbb.PeerDiscovery
         * @instance
         */
        PeerDiscovery.prototype.mac = "";

        /**
         * PeerDiscovery id.
         * @member {string} id
         * @memberof hbb.PeerDiscovery
         * @instance
         */
        PeerDiscovery.prototype.id = "";

        /**
         * PeerDiscovery username.
         * @member {string} username
         * @memberof hbb.PeerDiscovery
         * @instance
         */
        PeerDiscovery.prototype.username = "";

        /**
         * PeerDiscovery hostname.
         * @member {string} hostname
         * @memberof hbb.PeerDiscovery
         * @instance
         */
        PeerDiscovery.prototype.hostname = "";

        /**
         * PeerDiscovery platform.
         * @member {string} platform
         * @memberof hbb.PeerDiscovery
         * @instance
         */
        PeerDiscovery.prototype.platform = "";

        /**
         * PeerDiscovery misc.
         * @member {string} misc
         * @memberof hbb.PeerDiscovery
         * @instance
         */
        PeerDiscovery.prototype.misc = "";

        /**
         * Creates a new PeerDiscovery instance using the specified properties.
         * @function create
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {hbb.PeerDiscovery.$Properties=} [properties] Properties to set
         * @returns {hbb.PeerDiscovery} PeerDiscovery instance
         * @type {{
         *   (properties: hbb.PeerDiscovery.$Shape): hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape;
         *   (properties?: hbb.PeerDiscovery.$Properties): hbb.PeerDiscovery;
         * }}
         */
        PeerDiscovery.create = function(properties) {
            return new PeerDiscovery(properties);
        };

        /**
         * Encodes the specified PeerDiscovery message. Does not implicitly {@link hbb.PeerDiscovery.verify|verify} messages.
         * @function encode
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {hbb.PeerDiscovery.$Properties} message PeerDiscovery message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PeerDiscovery.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.cmd != null && $Object.hasOwnProperty.call(message, "cmd") && message.cmd !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.cmd);
            if (message.mac != null && $Object.hasOwnProperty.call(message, "mac") && message.mac !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.mac);
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.id);
            if (message.username != null && $Object.hasOwnProperty.call(message, "username") && message.username !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.username);
            if (message.hostname != null && $Object.hasOwnProperty.call(message, "hostname") && message.hostname !== "")
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.hostname);
            if (message.platform != null && $Object.hasOwnProperty.call(message, "platform") && message.platform !== "")
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.platform);
            if (message.misc != null && $Object.hasOwnProperty.call(message, "misc") && message.misc !== "")
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.misc);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified PeerDiscovery message, length delimited. Does not implicitly {@link hbb.PeerDiscovery.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {hbb.PeerDiscovery.$Properties} message PeerDiscovery message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PeerDiscovery.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a PeerDiscovery message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape} PeerDiscovery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PeerDiscovery.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.PeerDiscovery();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.cmd = value;
                        else
                            delete message.cmd;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.mac = value;
                        else
                            delete message.mac;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.username = value;
                        else
                            delete message.username;
                        continue;
                    }
                case 5: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.hostname = value;
                        else
                            delete message.hostname;
                        continue;
                    }
                case 6: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.platform = value;
                        else
                            delete message.platform;
                        continue;
                    }
                case 7: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.misc = value;
                        else
                            delete message.misc;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a PeerDiscovery message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.PeerDiscovery & hbb.PeerDiscovery.$Shape} PeerDiscovery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PeerDiscovery.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PeerDiscovery message.
         * @function verify
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PeerDiscovery.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.cmd != null && $Object.hasOwnProperty.call(message, "cmd"))
                if (!$util.isString(message.cmd))
                    return "cmd: string expected";
            if (message.mac != null && $Object.hasOwnProperty.call(message, "mac"))
                if (!$util.isString(message.mac))
                    return "mac: string expected";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.username != null && $Object.hasOwnProperty.call(message, "username"))
                if (!$util.isString(message.username))
                    return "username: string expected";
            if (message.hostname != null && $Object.hasOwnProperty.call(message, "hostname"))
                if (!$util.isString(message.hostname))
                    return "hostname: string expected";
            if (message.platform != null && $Object.hasOwnProperty.call(message, "platform"))
                if (!$util.isString(message.platform))
                    return "platform: string expected";
            if (message.misc != null && $Object.hasOwnProperty.call(message, "misc"))
                if (!$util.isString(message.misc))
                    return "misc: string expected";
            return null;
        };

        /**
         * Creates a PeerDiscovery message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.PeerDiscovery} PeerDiscovery
         */
        PeerDiscovery.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.PeerDiscovery)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.PeerDiscovery: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.PeerDiscovery();
            if (object.cmd != null)
                if (typeof object.cmd !== "string" || object.cmd.length)
                    message.cmd = $String(object.cmd);
            if (object.mac != null)
                if (typeof object.mac !== "string" || object.mac.length)
                    message.mac = $String(object.mac);
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.username != null)
                if (typeof object.username !== "string" || object.username.length)
                    message.username = $String(object.username);
            if (object.hostname != null)
                if (typeof object.hostname !== "string" || object.hostname.length)
                    message.hostname = $String(object.hostname);
            if (object.platform != null)
                if (typeof object.platform !== "string" || object.platform.length)
                    message.platform = $String(object.platform);
            if (object.misc != null)
                if (typeof object.misc !== "string" || object.misc.length)
                    message.misc = $String(object.misc);
            return message;
        };

        /**
         * Creates a plain object from a PeerDiscovery message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {hbb.PeerDiscovery} message PeerDiscovery
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PeerDiscovery.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.cmd = "";
                object.mac = "";
                object.id = "";
                object.username = "";
                object.hostname = "";
                object.platform = "";
                object.misc = "";
            }
            if (message.cmd != null && $Object.hasOwnProperty.call(message, "cmd"))
                object.cmd = message.cmd;
            if (message.mac != null && $Object.hasOwnProperty.call(message, "mac"))
                object.mac = message.mac;
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.username != null && $Object.hasOwnProperty.call(message, "username"))
                object.username = message.username;
            if (message.hostname != null && $Object.hasOwnProperty.call(message, "hostname"))
                object.hostname = message.hostname;
            if (message.platform != null && $Object.hasOwnProperty.call(message, "platform"))
                object.platform = message.platform;
            if (message.misc != null && $Object.hasOwnProperty.call(message, "misc"))
                object.misc = message.misc;
            return object;
        };

        /**
         * Converts this PeerDiscovery to JSON.
         * @function toJSON
         * @memberof hbb.PeerDiscovery
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PeerDiscovery.prototype.toJSON = function() {
            return PeerDiscovery.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for PeerDiscovery
         * @function getTypeUrl
         * @memberof hbb.PeerDiscovery
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        PeerDiscovery.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.PeerDiscovery";
        };

        return PeerDiscovery;
    })();

    hbb.OnlineRequest = (function() {

        /**
         * Properties of an OnlineRequest.
         * @typedef {Object} hbb.OnlineRequest.$Properties
         * @property {string|null} [id] OnlineRequest id
         * @property {Array.<string>|null} [peers] OnlineRequest peers
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of an OnlineRequest.
         * @memberof hbb
         * @interface IOnlineRequest
         * @augments hbb.OnlineRequest.$Properties
         * @deprecated Use hbb.OnlineRequest.$Properties instead.
         */

        /**
         * Shape of an OnlineRequest.
         * @typedef {hbb.OnlineRequest.$Properties} hbb.OnlineRequest.$Shape
         */

        /**
         * Constructs a new OnlineRequest.
         * @memberof hbb
         * @classdesc Represents an OnlineRequest.
         * @constructor
         * @param {hbb.OnlineRequest.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const OnlineRequest = function (properties) {
            this.peers = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * OnlineRequest id.
         * @member {string} id
         * @memberof hbb.OnlineRequest
         * @instance
         */
        OnlineRequest.prototype.id = "";

        /**
         * OnlineRequest peers.
         * @member {Array.<string>} peers
         * @memberof hbb.OnlineRequest
         * @instance
         */
        OnlineRequest.prototype.peers = $util.emptyArray;

        /**
         * Creates a new OnlineRequest instance using the specified properties.
         * @function create
         * @memberof hbb.OnlineRequest
         * @static
         * @param {hbb.OnlineRequest.$Properties=} [properties] Properties to set
         * @returns {hbb.OnlineRequest} OnlineRequest instance
         * @type {{
         *   (properties: hbb.OnlineRequest.$Shape): hbb.OnlineRequest & hbb.OnlineRequest.$Shape;
         *   (properties?: hbb.OnlineRequest.$Properties): hbb.OnlineRequest;
         * }}
         */
        OnlineRequest.create = function(properties) {
            return new OnlineRequest(properties);
        };

        /**
         * Encodes the specified OnlineRequest message. Does not implicitly {@link hbb.OnlineRequest.verify|verify} messages.
         * @function encode
         * @memberof hbb.OnlineRequest
         * @static
         * @param {hbb.OnlineRequest.$Properties} message OnlineRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        OnlineRequest.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.peers != null && message.peers.length)
                for (let i = 0; i < message.peers.length; ++i)
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.peers[i]);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified OnlineRequest message, length delimited. Does not implicitly {@link hbb.OnlineRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.OnlineRequest
         * @static
         * @param {hbb.OnlineRequest.$Properties} message OnlineRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        OnlineRequest.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes an OnlineRequest message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.OnlineRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.OnlineRequest & hbb.OnlineRequest.$Shape} OnlineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        OnlineRequest.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.OnlineRequest();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.id = value;
                        else
                            delete message.id;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if (!(message.peers && message.peers.length))
                            message.peers = [];
                        message.peers.push(reader.stringVerify());
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes an OnlineRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.OnlineRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.OnlineRequest & hbb.OnlineRequest.$Shape} OnlineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        OnlineRequest.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an OnlineRequest message.
         * @function verify
         * @memberof hbb.OnlineRequest
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        OnlineRequest.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.peers != null && $Object.hasOwnProperty.call(message, "peers")) {
                if (!$Array.isArray(message.peers))
                    return "peers: array expected";
                for (let i = 0; i < message.peers.length; ++i)
                    if (!$util.isString(message.peers[i]))
                        return "peers: string[] expected";
            }
            return null;
        };

        /**
         * Creates an OnlineRequest message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.OnlineRequest
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.OnlineRequest} OnlineRequest
         */
        OnlineRequest.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.OnlineRequest)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.OnlineRequest: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.OnlineRequest();
            if (object.id != null)
                if (typeof object.id !== "string" || object.id.length)
                    message.id = $String(object.id);
            if (object.peers) {
                if (!$Array.isArray(object.peers))
                    throw $TypeError(".hbb.OnlineRequest.peers: array expected");
                message.peers = $Array(object.peers.length);
                for (let i = 0; i < object.peers.length; ++i)
                    message.peers[i] = $String(object.peers[i]);
            }
            return message;
        };

        /**
         * Creates a plain object from an OnlineRequest message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.OnlineRequest
         * @static
         * @param {hbb.OnlineRequest} message OnlineRequest
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        OnlineRequest.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults)
                object.peers = [];
            if (options.defaults)
                object.id = "";
            if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
                object.id = message.id;
            if (message.peers && message.peers.length) {
                object.peers = $Array(message.peers.length);
                for (let j = 0; j < message.peers.length; ++j)
                    object.peers[j] = message.peers[j];
            }
            return object;
        };

        /**
         * Converts this OnlineRequest to JSON.
         * @function toJSON
         * @memberof hbb.OnlineRequest
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        OnlineRequest.prototype.toJSON = function() {
            return OnlineRequest.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for OnlineRequest
         * @function getTypeUrl
         * @memberof hbb.OnlineRequest
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        OnlineRequest.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.OnlineRequest";
        };

        return OnlineRequest;
    })();

    hbb.OnlineResponse = (function() {

        /**
         * Properties of an OnlineResponse.
         * @typedef {Object} hbb.OnlineResponse.$Properties
         * @property {Uint8Array|null} [states] OnlineResponse states
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of an OnlineResponse.
         * @memberof hbb
         * @interface IOnlineResponse
         * @augments hbb.OnlineResponse.$Properties
         * @deprecated Use hbb.OnlineResponse.$Properties instead.
         */

        /**
         * Shape of an OnlineResponse.
         * @typedef {hbb.OnlineResponse.$Properties} hbb.OnlineResponse.$Shape
         */

        /**
         * Constructs a new OnlineResponse.
         * @memberof hbb
         * @classdesc Represents an OnlineResponse.
         * @constructor
         * @param {hbb.OnlineResponse.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const OnlineResponse = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * OnlineResponse states.
         * @member {Uint8Array} states
         * @memberof hbb.OnlineResponse
         * @instance
         */
        OnlineResponse.prototype.states = $util.newBuffer([]);

        /**
         * Creates a new OnlineResponse instance using the specified properties.
         * @function create
         * @memberof hbb.OnlineResponse
         * @static
         * @param {hbb.OnlineResponse.$Properties=} [properties] Properties to set
         * @returns {hbb.OnlineResponse} OnlineResponse instance
         * @type {{
         *   (properties: hbb.OnlineResponse.$Shape): hbb.OnlineResponse & hbb.OnlineResponse.$Shape;
         *   (properties?: hbb.OnlineResponse.$Properties): hbb.OnlineResponse;
         * }}
         */
        OnlineResponse.create = function(properties) {
            return new OnlineResponse(properties);
        };

        /**
         * Encodes the specified OnlineResponse message. Does not implicitly {@link hbb.OnlineResponse.verify|verify} messages.
         * @function encode
         * @memberof hbb.OnlineResponse
         * @static
         * @param {hbb.OnlineResponse.$Properties} message OnlineResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        OnlineResponse.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.states != null && $Object.hasOwnProperty.call(message, "states") && message.states.length)
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.states);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified OnlineResponse message, length delimited. Does not implicitly {@link hbb.OnlineResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.OnlineResponse
         * @static
         * @param {hbb.OnlineResponse.$Properties} message OnlineResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        OnlineResponse.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes an OnlineResponse message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.OnlineResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.OnlineResponse & hbb.OnlineResponse.$Shape} OnlineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        OnlineResponse.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.OnlineResponse();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.bytes()).length)
                            message.states = value;
                        else
                            delete message.states;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes an OnlineResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.OnlineResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.OnlineResponse & hbb.OnlineResponse.$Shape} OnlineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        OnlineResponse.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an OnlineResponse message.
         * @function verify
         * @memberof hbb.OnlineResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        OnlineResponse.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.states != null && $Object.hasOwnProperty.call(message, "states"))
                if (!(message.states && typeof message.states.length === "number" || $util.isString(message.states)))
                    return "states: buffer expected";
            return null;
        };

        /**
         * Creates an OnlineResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.OnlineResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.OnlineResponse} OnlineResponse
         */
        OnlineResponse.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.OnlineResponse)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.OnlineResponse: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.OnlineResponse();
            if (object.states != null)
                if (object.states.length)
                    if (typeof object.states === "string")
                        $util.base64.decode(object.states, message.states = $util.newBuffer($util.base64.length(object.states)), 0);
                    else if (object.states.length >= 0)
                        message.states = object.states;
            return message;
        };

        /**
         * Creates a plain object from an OnlineResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.OnlineResponse
         * @static
         * @param {hbb.OnlineResponse} message OnlineResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        OnlineResponse.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults)
                if (options.bytes === $String)
                    object.states = "";
                else {
                    object.states = [];
                    if (options.bytes !== $Array)
                        object.states = $util.newBuffer(object.states);
                }
            if (message.states != null && $Object.hasOwnProperty.call(message, "states"))
                object.states = options.bytes === $String ? $util.base64.encode(message.states, 0, message.states.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.states) : message.states;
            return object;
        };

        /**
         * Converts this OnlineResponse to JSON.
         * @function toJSON
         * @memberof hbb.OnlineResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        OnlineResponse.prototype.toJSON = function() {
            return OnlineResponse.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for OnlineResponse
         * @function getTypeUrl
         * @memberof hbb.OnlineResponse
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        OnlineResponse.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.OnlineResponse";
        };

        return OnlineResponse;
    })();

    hbb.KeyExchange = (function() {

        /**
         * Properties of a KeyExchange.
         * @typedef {Object} hbb.KeyExchange.$Properties
         * @property {Array.<Uint8Array>|null} [keys] KeyExchange keys
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a KeyExchange.
         * @memberof hbb
         * @interface IKeyExchange
         * @augments hbb.KeyExchange.$Properties
         * @deprecated Use hbb.KeyExchange.$Properties instead.
         */

        /**
         * Shape of a KeyExchange.
         * @typedef {hbb.KeyExchange.$Properties} hbb.KeyExchange.$Shape
         */

        /**
         * Constructs a new KeyExchange.
         * @memberof hbb
         * @classdesc Represents a KeyExchange.
         * @constructor
         * @param {hbb.KeyExchange.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const KeyExchange = function (properties) {
            this.keys = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * KeyExchange keys.
         * @member {Array.<Uint8Array>} keys
         * @memberof hbb.KeyExchange
         * @instance
         */
        KeyExchange.prototype.keys = $util.emptyArray;

        /**
         * Creates a new KeyExchange instance using the specified properties.
         * @function create
         * @memberof hbb.KeyExchange
         * @static
         * @param {hbb.KeyExchange.$Properties=} [properties] Properties to set
         * @returns {hbb.KeyExchange} KeyExchange instance
         * @type {{
         *   (properties: hbb.KeyExchange.$Shape): hbb.KeyExchange & hbb.KeyExchange.$Shape;
         *   (properties?: hbb.KeyExchange.$Properties): hbb.KeyExchange;
         * }}
         */
        KeyExchange.create = function(properties) {
            return new KeyExchange(properties);
        };

        /**
         * Encodes the specified KeyExchange message. Does not implicitly {@link hbb.KeyExchange.verify|verify} messages.
         * @function encode
         * @memberof hbb.KeyExchange
         * @static
         * @param {hbb.KeyExchange.$Properties} message KeyExchange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        KeyExchange.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.keys != null && message.keys.length)
                for (let i = 0; i < message.keys.length; ++i)
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.keys[i]);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified KeyExchange message, length delimited. Does not implicitly {@link hbb.KeyExchange.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.KeyExchange
         * @static
         * @param {hbb.KeyExchange.$Properties} message KeyExchange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        KeyExchange.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a KeyExchange message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.KeyExchange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.KeyExchange & hbb.KeyExchange.$Shape} KeyExchange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        KeyExchange.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.KeyExchange();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if (!(message.keys && message.keys.length))
                            message.keys = [];
                        message.keys.push(reader.bytes());
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a KeyExchange message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.KeyExchange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.KeyExchange & hbb.KeyExchange.$Shape} KeyExchange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        KeyExchange.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a KeyExchange message.
         * @function verify
         * @memberof hbb.KeyExchange
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        KeyExchange.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.keys != null && $Object.hasOwnProperty.call(message, "keys")) {
                if (!$Array.isArray(message.keys))
                    return "keys: array expected";
                for (let i = 0; i < message.keys.length; ++i)
                    if (!(message.keys[i] && typeof message.keys[i].length === "number" || $util.isString(message.keys[i])))
                        return "keys: buffer[] expected";
            }
            return null;
        };

        /**
         * Creates a KeyExchange message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.KeyExchange
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.KeyExchange} KeyExchange
         */
        KeyExchange.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.KeyExchange)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.KeyExchange: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.KeyExchange();
            if (object.keys) {
                if (!$Array.isArray(object.keys))
                    throw $TypeError(".hbb.KeyExchange.keys: array expected");
                message.keys = $Array(object.keys.length);
                for (let i = 0; i < object.keys.length; ++i)
                    if (typeof object.keys[i] === "string")
                        $util.base64.decode(object.keys[i], message.keys[i] = $util.newBuffer($util.base64.length(object.keys[i])), 0);
                    else if (object.keys[i].length >= 0)
                        message.keys[i] = object.keys[i];
            }
            return message;
        };

        /**
         * Creates a plain object from a KeyExchange message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.KeyExchange
         * @static
         * @param {hbb.KeyExchange} message KeyExchange
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        KeyExchange.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults)
                object.keys = [];
            if (message.keys && message.keys.length) {
                object.keys = $Array(message.keys.length);
                for (let j = 0; j < message.keys.length; ++j)
                    object.keys[j] = options.bytes === $String ? $util.base64.encode(message.keys[j], 0, message.keys[j].length) : options.bytes === $Array ? $Array.prototype.slice.call(message.keys[j]) : message.keys[j];
            }
            return object;
        };

        /**
         * Converts this KeyExchange to JSON.
         * @function toJSON
         * @memberof hbb.KeyExchange
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        KeyExchange.prototype.toJSON = function() {
            return KeyExchange.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for KeyExchange
         * @function getTypeUrl
         * @memberof hbb.KeyExchange
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        KeyExchange.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.KeyExchange";
        };

        return KeyExchange;
    })();

    hbb.HealthCheck = (function() {

        /**
         * Properties of a HealthCheck.
         * @typedef {Object} hbb.HealthCheck.$Properties
         * @property {string|null} [token] HealthCheck token
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a HealthCheck.
         * @memberof hbb
         * @interface IHealthCheck
         * @augments hbb.HealthCheck.$Properties
         * @deprecated Use hbb.HealthCheck.$Properties instead.
         */

        /**
         * Shape of a HealthCheck.
         * @typedef {hbb.HealthCheck.$Properties} hbb.HealthCheck.$Shape
         */

        /**
         * Constructs a new HealthCheck.
         * @memberof hbb
         * @classdesc Represents a HealthCheck.
         * @constructor
         * @param {hbb.HealthCheck.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const HealthCheck = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * HealthCheck token.
         * @member {string} token
         * @memberof hbb.HealthCheck
         * @instance
         */
        HealthCheck.prototype.token = "";

        /**
         * Creates a new HealthCheck instance using the specified properties.
         * @function create
         * @memberof hbb.HealthCheck
         * @static
         * @param {hbb.HealthCheck.$Properties=} [properties] Properties to set
         * @returns {hbb.HealthCheck} HealthCheck instance
         * @type {{
         *   (properties: hbb.HealthCheck.$Shape): hbb.HealthCheck & hbb.HealthCheck.$Shape;
         *   (properties?: hbb.HealthCheck.$Properties): hbb.HealthCheck;
         * }}
         */
        HealthCheck.create = function(properties) {
            return new HealthCheck(properties);
        };

        /**
         * Encodes the specified HealthCheck message. Does not implicitly {@link hbb.HealthCheck.verify|verify} messages.
         * @function encode
         * @memberof hbb.HealthCheck
         * @static
         * @param {hbb.HealthCheck.$Properties} message HealthCheck message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthCheck.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.token != null && $Object.hasOwnProperty.call(message, "token") && message.token !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.token);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified HealthCheck message, length delimited. Does not implicitly {@link hbb.HealthCheck.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.HealthCheck
         * @static
         * @param {hbb.HealthCheck.$Properties} message HealthCheck message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthCheck.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a HealthCheck message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.HealthCheck
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.HealthCheck & hbb.HealthCheck.$Shape} HealthCheck
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthCheck.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message, value;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.HealthCheck();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.token = value;
                        else
                            delete message.token;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a HealthCheck message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.HealthCheck
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.HealthCheck & hbb.HealthCheck.$Shape} HealthCheck
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthCheck.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a HealthCheck message.
         * @function verify
         * @memberof hbb.HealthCheck
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        HealthCheck.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.token != null && $Object.hasOwnProperty.call(message, "token"))
                if (!$util.isString(message.token))
                    return "token: string expected";
            return null;
        };

        /**
         * Creates a HealthCheck message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.HealthCheck
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.HealthCheck} HealthCheck
         */
        HealthCheck.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.HealthCheck)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.HealthCheck: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.HealthCheck();
            if (object.token != null)
                if (typeof object.token !== "string" || object.token.length)
                    message.token = $String(object.token);
            return message;
        };

        /**
         * Creates a plain object from a HealthCheck message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.HealthCheck
         * @static
         * @param {hbb.HealthCheck} message HealthCheck
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        HealthCheck.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults)
                object.token = "";
            if (message.token != null && $Object.hasOwnProperty.call(message, "token"))
                object.token = message.token;
            return object;
        };

        /**
         * Converts this HealthCheck to JSON.
         * @function toJSON
         * @memberof hbb.HealthCheck
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        HealthCheck.prototype.toJSON = function() {
            return HealthCheck.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for HealthCheck
         * @function getTypeUrl
         * @memberof hbb.HealthCheck
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        HealthCheck.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.HealthCheck";
        };

        return HealthCheck;
    })();

    hbb.RendezvousMessage = (function() {

        /**
         * Properties of a RendezvousMessage.
         * @typedef {Object} hbb.RendezvousMessage.$Properties
         * @property {hbb.RegisterPeer.$Properties|null} [registerPeer] RendezvousMessage registerPeer
         * @property {hbb.RegisterPeerResponse.$Properties|null} [registerPeerResponse] RendezvousMessage registerPeerResponse
         * @property {hbb.PunchHoleRequest.$Properties|null} [punchHoleRequest] RendezvousMessage punchHoleRequest
         * @property {hbb.PunchHole.$Properties|null} [punchHole] RendezvousMessage punchHole
         * @property {hbb.PunchHoleSent.$Properties|null} [punchHoleSent] RendezvousMessage punchHoleSent
         * @property {hbb.PunchHoleResponse.$Properties|null} [punchHoleResponse] RendezvousMessage punchHoleResponse
         * @property {hbb.FetchLocalAddr.$Properties|null} [fetchLocalAddr] RendezvousMessage fetchLocalAddr
         * @property {hbb.LocalAddr.$Properties|null} [localAddr] RendezvousMessage localAddr
         * @property {hbb.ConfigUpdate.$Properties|null} [configureUpdate] RendezvousMessage configureUpdate
         * @property {hbb.RegisterPk.$Properties|null} [registerPk] RendezvousMessage registerPk
         * @property {hbb.RegisterPkResponse.$Properties|null} [registerPkResponse] RendezvousMessage registerPkResponse
         * @property {hbb.SoftwareUpdate.$Properties|null} [softwareUpdate] RendezvousMessage softwareUpdate
         * @property {hbb.RequestRelay.$Properties|null} [requestRelay] RendezvousMessage requestRelay
         * @property {hbb.RelayResponse.$Properties|null} [relayResponse] RendezvousMessage relayResponse
         * @property {hbb.TestNatRequest.$Properties|null} [testNatRequest] RendezvousMessage testNatRequest
         * @property {hbb.TestNatResponse.$Properties|null} [testNatResponse] RendezvousMessage testNatResponse
         * @property {hbb.PeerDiscovery.$Properties|null} [peerDiscovery] RendezvousMessage peerDiscovery
         * @property {hbb.OnlineRequest.$Properties|null} [onlineRequest] RendezvousMessage onlineRequest
         * @property {hbb.OnlineResponse.$Properties|null} [onlineResponse] RendezvousMessage onlineResponse
         * @property {hbb.KeyExchange.$Properties|null} [keyExchange] RendezvousMessage keyExchange
         * @property {hbb.HealthCheck.$Properties|null} [hc] RendezvousMessage hc
         * @property {"registerPeer"|"registerPeerResponse"|"punchHoleRequest"|"punchHole"|"punchHoleSent"|"punchHoleResponse"|"fetchLocalAddr"|"localAddr"|"configureUpdate"|"registerPk"|"registerPkResponse"|"softwareUpdate"|"requestRelay"|"relayResponse"|"testNatRequest"|"testNatResponse"|"peerDiscovery"|"onlineRequest"|"onlineResponse"|"keyExchange"|"hc"} [union] RendezvousMessage union
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a RendezvousMessage.
         * @memberof hbb
         * @interface IRendezvousMessage
         * @augments hbb.RendezvousMessage.$Properties
         * @deprecated Use hbb.RendezvousMessage.$Properties instead.
         */

        /**
         * Narrowed shape of a RendezvousMessage.
         * @typedef {{
         *   registerPeer?: hbb.RegisterPeer.$Shape|null;
         *   registerPeerResponse?: hbb.RegisterPeerResponse.$Shape|null;
         *   punchHoleRequest?: hbb.PunchHoleRequest.$Shape|null;
         *   punchHole?: hbb.PunchHole.$Shape|null;
         *   punchHoleSent?: hbb.PunchHoleSent.$Shape|null;
         *   punchHoleResponse?: hbb.PunchHoleResponse.$Shape|null;
         *   fetchLocalAddr?: hbb.FetchLocalAddr.$Shape|null;
         *   localAddr?: hbb.LocalAddr.$Shape|null;
         *   configureUpdate?: hbb.ConfigUpdate.$Shape|null;
         *   registerPk?: hbb.RegisterPk.$Shape|null;
         *   registerPkResponse?: hbb.RegisterPkResponse.$Shape|null;
         *   softwareUpdate?: hbb.SoftwareUpdate.$Shape|null;
         *   requestRelay?: hbb.RequestRelay.$Shape|null;
         *   relayResponse?: hbb.RelayResponse.$Shape|null;
         *   testNatRequest?: hbb.TestNatRequest.$Shape|null;
         *   testNatResponse?: hbb.TestNatResponse.$Shape|null;
         *   peerDiscovery?: hbb.PeerDiscovery.$Shape|null;
         *   onlineRequest?: hbb.OnlineRequest.$Shape|null;
         *   onlineResponse?: hbb.OnlineResponse.$Shape|null;
         *   keyExchange?: hbb.KeyExchange.$Shape|null;
         *   hc?: hbb.HealthCheck.$Shape|null;
         *   $unknowns?: Array.<Uint8Array>;
         * } & (
         *   ({ union?: undefined; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPeer"; registerPeer: hbb.RegisterPeer.$Shape; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPeerResponse"; registerPeer?: null; registerPeerResponse: hbb.RegisterPeerResponse.$Shape; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHoleRequest"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest: hbb.PunchHoleRequest.$Shape; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHole"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole: hbb.PunchHole.$Shape; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHoleSent"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent: hbb.PunchHoleSent.$Shape; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "punchHoleResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse: hbb.PunchHoleResponse.$Shape; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "fetchLocalAddr"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr: hbb.FetchLocalAddr.$Shape; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "localAddr"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr: hbb.LocalAddr.$Shape; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "configureUpdate"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate: hbb.ConfigUpdate.$Shape; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPk"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk: hbb.RegisterPk.$Shape; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "registerPkResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse: hbb.RegisterPkResponse.$Shape; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "softwareUpdate"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate: hbb.SoftwareUpdate.$Shape; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "requestRelay"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay: hbb.RequestRelay.$Shape; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "relayResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse: hbb.RelayResponse.$Shape; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "testNatRequest"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest: hbb.TestNatRequest.$Shape; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "testNatResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse: hbb.TestNatResponse.$Shape; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "peerDiscovery"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery: hbb.PeerDiscovery.$Shape; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "onlineRequest"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest: hbb.OnlineRequest.$Shape; onlineResponse?: null; keyExchange?: null; hc?: null }|{ union?: "onlineResponse"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse: hbb.OnlineResponse.$Shape; keyExchange?: null; hc?: null }|{ union?: "keyExchange"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange: hbb.KeyExchange.$Shape; hc?: null }|{ union?: "hc"; registerPeer?: null; registerPeerResponse?: null; punchHoleRequest?: null; punchHole?: null; punchHoleSent?: null; punchHoleResponse?: null; fetchLocalAddr?: null; localAddr?: null; configureUpdate?: null; registerPk?: null; registerPkResponse?: null; softwareUpdate?: null; requestRelay?: null; relayResponse?: null; testNatRequest?: null; testNatResponse?: null; peerDiscovery?: null; onlineRequest?: null; onlineResponse?: null; keyExchange?: null; hc: hbb.HealthCheck.$Shape })
         * )} hbb.RendezvousMessage.$Shape
         */

        /**
         * Constructs a new RendezvousMessage.
         * @memberof hbb
         * @classdesc Represents a RendezvousMessage.
         * @constructor
         * @param {hbb.RendezvousMessage.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const RendezvousMessage = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * RendezvousMessage registerPeer.
         * @member {hbb.RegisterPeer.$Properties|null|undefined} registerPeer
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.registerPeer = null;

        /**
         * RendezvousMessage registerPeerResponse.
         * @member {hbb.RegisterPeerResponse.$Properties|null|undefined} registerPeerResponse
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.registerPeerResponse = null;

        /**
         * RendezvousMessage punchHoleRequest.
         * @member {hbb.PunchHoleRequest.$Properties|null|undefined} punchHoleRequest
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.punchHoleRequest = null;

        /**
         * RendezvousMessage punchHole.
         * @member {hbb.PunchHole.$Properties|null|undefined} punchHole
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.punchHole = null;

        /**
         * RendezvousMessage punchHoleSent.
         * @member {hbb.PunchHoleSent.$Properties|null|undefined} punchHoleSent
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.punchHoleSent = null;

        /**
         * RendezvousMessage punchHoleResponse.
         * @member {hbb.PunchHoleResponse.$Properties|null|undefined} punchHoleResponse
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.punchHoleResponse = null;

        /**
         * RendezvousMessage fetchLocalAddr.
         * @member {hbb.FetchLocalAddr.$Properties|null|undefined} fetchLocalAddr
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.fetchLocalAddr = null;

        /**
         * RendezvousMessage localAddr.
         * @member {hbb.LocalAddr.$Properties|null|undefined} localAddr
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.localAddr = null;

        /**
         * RendezvousMessage configureUpdate.
         * @member {hbb.ConfigUpdate.$Properties|null|undefined} configureUpdate
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.configureUpdate = null;

        /**
         * RendezvousMessage registerPk.
         * @member {hbb.RegisterPk.$Properties|null|undefined} registerPk
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.registerPk = null;

        /**
         * RendezvousMessage registerPkResponse.
         * @member {hbb.RegisterPkResponse.$Properties|null|undefined} registerPkResponse
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.registerPkResponse = null;

        /**
         * RendezvousMessage softwareUpdate.
         * @member {hbb.SoftwareUpdate.$Properties|null|undefined} softwareUpdate
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.softwareUpdate = null;

        /**
         * RendezvousMessage requestRelay.
         * @member {hbb.RequestRelay.$Properties|null|undefined} requestRelay
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.requestRelay = null;

        /**
         * RendezvousMessage relayResponse.
         * @member {hbb.RelayResponse.$Properties|null|undefined} relayResponse
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.relayResponse = null;

        /**
         * RendezvousMessage testNatRequest.
         * @member {hbb.TestNatRequest.$Properties|null|undefined} testNatRequest
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.testNatRequest = null;

        /**
         * RendezvousMessage testNatResponse.
         * @member {hbb.TestNatResponse.$Properties|null|undefined} testNatResponse
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.testNatResponse = null;

        /**
         * RendezvousMessage peerDiscovery.
         * @member {hbb.PeerDiscovery.$Properties|null|undefined} peerDiscovery
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.peerDiscovery = null;

        /**
         * RendezvousMessage onlineRequest.
         * @member {hbb.OnlineRequest.$Properties|null|undefined} onlineRequest
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.onlineRequest = null;

        /**
         * RendezvousMessage onlineResponse.
         * @member {hbb.OnlineResponse.$Properties|null|undefined} onlineResponse
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.onlineResponse = null;

        /**
         * RendezvousMessage keyExchange.
         * @member {hbb.KeyExchange.$Properties|null|undefined} keyExchange
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.keyExchange = null;

        /**
         * RendezvousMessage hc.
         * @member {hbb.HealthCheck.$Properties|null|undefined} hc
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        RendezvousMessage.prototype.hc = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * RendezvousMessage union.
         * @member {"registerPeer"|"registerPeerResponse"|"punchHoleRequest"|"punchHole"|"punchHoleSent"|"punchHoleResponse"|"fetchLocalAddr"|"localAddr"|"configureUpdate"|"registerPk"|"registerPkResponse"|"softwareUpdate"|"requestRelay"|"relayResponse"|"testNatRequest"|"testNatResponse"|"peerDiscovery"|"onlineRequest"|"onlineResponse"|"keyExchange"|"hc"|undefined} union
         * @memberof hbb.RendezvousMessage
         * @instance
         */
        $Object.defineProperty(RendezvousMessage.prototype, "union", {
            get: $util.oneOfGetter($oneOfFields = ["registerPeer", "registerPeerResponse", "punchHoleRequest", "punchHole", "punchHoleSent", "punchHoleResponse", "fetchLocalAddr", "localAddr", "configureUpdate", "registerPk", "registerPkResponse", "softwareUpdate", "requestRelay", "relayResponse", "testNatRequest", "testNatResponse", "peerDiscovery", "onlineRequest", "onlineResponse", "keyExchange", "hc"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new RendezvousMessage instance using the specified properties.
         * @function create
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {hbb.RendezvousMessage.$Properties=} [properties] Properties to set
         * @returns {hbb.RendezvousMessage} RendezvousMessage instance
         * @type {{
         *   (properties: hbb.RendezvousMessage.$Shape): hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape;
         *   (properties?: hbb.RendezvousMessage.$Properties): hbb.RendezvousMessage;
         * }}
         */
        RendezvousMessage.create = function(properties) {
            return new RendezvousMessage(properties);
        };

        /**
         * Encodes the specified RendezvousMessage message. Does not implicitly {@link hbb.RendezvousMessage.verify|verify} messages.
         * @function encode
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {hbb.RendezvousMessage.$Properties} message RendezvousMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RendezvousMessage.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.registerPeer != null && $Object.hasOwnProperty.call(message, "registerPeer"))
                $root.hbb.RegisterPeer.encode(message.registerPeer, writer.uint32(/* id 6, wireType 2 =*/50).fork(), _depth + 1).ldelim();
            if (message.registerPeerResponse != null && $Object.hasOwnProperty.call(message, "registerPeerResponse"))
                $root.hbb.RegisterPeerResponse.encode(message.registerPeerResponse, writer.uint32(/* id 7, wireType 2 =*/58).fork(), _depth + 1).ldelim();
            if (message.punchHoleRequest != null && $Object.hasOwnProperty.call(message, "punchHoleRequest"))
                $root.hbb.PunchHoleRequest.encode(message.punchHoleRequest, writer.uint32(/* id 8, wireType 2 =*/66).fork(), _depth + 1).ldelim();
            if (message.punchHole != null && $Object.hasOwnProperty.call(message, "punchHole"))
                $root.hbb.PunchHole.encode(message.punchHole, writer.uint32(/* id 9, wireType 2 =*/74).fork(), _depth + 1).ldelim();
            if (message.punchHoleSent != null && $Object.hasOwnProperty.call(message, "punchHoleSent"))
                $root.hbb.PunchHoleSent.encode(message.punchHoleSent, writer.uint32(/* id 10, wireType 2 =*/82).fork(), _depth + 1).ldelim();
            if (message.punchHoleResponse != null && $Object.hasOwnProperty.call(message, "punchHoleResponse"))
                $root.hbb.PunchHoleResponse.encode(message.punchHoleResponse, writer.uint32(/* id 11, wireType 2 =*/90).fork(), _depth + 1).ldelim();
            if (message.fetchLocalAddr != null && $Object.hasOwnProperty.call(message, "fetchLocalAddr"))
                $root.hbb.FetchLocalAddr.encode(message.fetchLocalAddr, writer.uint32(/* id 12, wireType 2 =*/98).fork(), _depth + 1).ldelim();
            if (message.localAddr != null && $Object.hasOwnProperty.call(message, "localAddr"))
                $root.hbb.LocalAddr.encode(message.localAddr, writer.uint32(/* id 13, wireType 2 =*/106).fork(), _depth + 1).ldelim();
            if (message.configureUpdate != null && $Object.hasOwnProperty.call(message, "configureUpdate"))
                $root.hbb.ConfigUpdate.encode(message.configureUpdate, writer.uint32(/* id 14, wireType 2 =*/114).fork(), _depth + 1).ldelim();
            if (message.registerPk != null && $Object.hasOwnProperty.call(message, "registerPk"))
                $root.hbb.RegisterPk.encode(message.registerPk, writer.uint32(/* id 15, wireType 2 =*/122).fork(), _depth + 1).ldelim();
            if (message.registerPkResponse != null && $Object.hasOwnProperty.call(message, "registerPkResponse"))
                $root.hbb.RegisterPkResponse.encode(message.registerPkResponse, writer.uint32(/* id 16, wireType 2 =*/130).fork(), _depth + 1).ldelim();
            if (message.softwareUpdate != null && $Object.hasOwnProperty.call(message, "softwareUpdate"))
                $root.hbb.SoftwareUpdate.encode(message.softwareUpdate, writer.uint32(/* id 17, wireType 2 =*/138).fork(), _depth + 1).ldelim();
            if (message.requestRelay != null && $Object.hasOwnProperty.call(message, "requestRelay"))
                $root.hbb.RequestRelay.encode(message.requestRelay, writer.uint32(/* id 18, wireType 2 =*/146).fork(), _depth + 1).ldelim();
            if (message.relayResponse != null && $Object.hasOwnProperty.call(message, "relayResponse"))
                $root.hbb.RelayResponse.encode(message.relayResponse, writer.uint32(/* id 19, wireType 2 =*/154).fork(), _depth + 1).ldelim();
            if (message.testNatRequest != null && $Object.hasOwnProperty.call(message, "testNatRequest"))
                $root.hbb.TestNatRequest.encode(message.testNatRequest, writer.uint32(/* id 20, wireType 2 =*/162).fork(), _depth + 1).ldelim();
            if (message.testNatResponse != null && $Object.hasOwnProperty.call(message, "testNatResponse"))
                $root.hbb.TestNatResponse.encode(message.testNatResponse, writer.uint32(/* id 21, wireType 2 =*/170).fork(), _depth + 1).ldelim();
            if (message.peerDiscovery != null && $Object.hasOwnProperty.call(message, "peerDiscovery"))
                $root.hbb.PeerDiscovery.encode(message.peerDiscovery, writer.uint32(/* id 22, wireType 2 =*/178).fork(), _depth + 1).ldelim();
            if (message.onlineRequest != null && $Object.hasOwnProperty.call(message, "onlineRequest"))
                $root.hbb.OnlineRequest.encode(message.onlineRequest, writer.uint32(/* id 23, wireType 2 =*/186).fork(), _depth + 1).ldelim();
            if (message.onlineResponse != null && $Object.hasOwnProperty.call(message, "onlineResponse"))
                $root.hbb.OnlineResponse.encode(message.onlineResponse, writer.uint32(/* id 24, wireType 2 =*/194).fork(), _depth + 1).ldelim();
            if (message.keyExchange != null && $Object.hasOwnProperty.call(message, "keyExchange"))
                $root.hbb.KeyExchange.encode(message.keyExchange, writer.uint32(/* id 25, wireType 2 =*/202).fork(), _depth + 1).ldelim();
            if (message.hc != null && $Object.hasOwnProperty.call(message, "hc"))
                $root.hbb.HealthCheck.encode(message.hc, writer.uint32(/* id 26, wireType 2 =*/210).fork(), _depth + 1).ldelim();
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified RendezvousMessage message, length delimited. Does not implicitly {@link hbb.RendezvousMessage.verify|verify} messages.
         * @function encodeDelimited
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {hbb.RendezvousMessage.$Properties} message RendezvousMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RendezvousMessage.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a RendezvousMessage message from the specified reader or buffer.
         * @function decode
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape} RendezvousMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RendezvousMessage.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end, message;
            if (length === $undefined)
                end = reader.len;
            else {
                end = reader.pos + length;
                if (end > reader.len)
                    throw $RangeError("index out of range");
                length = reader.len;
                reader.len = end;
            }
            message = _target || new $root.hbb.RendezvousMessage();
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 6: {
                        if (wireType !== 2)
                            break;
                        message.registerPeer = $root.hbb.RegisterPeer.decode(reader, reader.uint32(), $undefined, _depth + 1, message.registerPeer);
                        message.union = "registerPeer";
                        continue;
                    }
                case 7: {
                        if (wireType !== 2)
                            break;
                        message.registerPeerResponse = $root.hbb.RegisterPeerResponse.decode(reader, reader.uint32(), $undefined, _depth + 1, message.registerPeerResponse);
                        message.union = "registerPeerResponse";
                        continue;
                    }
                case 8: {
                        if (wireType !== 2)
                            break;
                        message.punchHoleRequest = $root.hbb.PunchHoleRequest.decode(reader, reader.uint32(), $undefined, _depth + 1, message.punchHoleRequest);
                        message.union = "punchHoleRequest";
                        continue;
                    }
                case 9: {
                        if (wireType !== 2)
                            break;
                        message.punchHole = $root.hbb.PunchHole.decode(reader, reader.uint32(), $undefined, _depth + 1, message.punchHole);
                        message.union = "punchHole";
                        continue;
                    }
                case 10: {
                        if (wireType !== 2)
                            break;
                        message.punchHoleSent = $root.hbb.PunchHoleSent.decode(reader, reader.uint32(), $undefined, _depth + 1, message.punchHoleSent);
                        message.union = "punchHoleSent";
                        continue;
                    }
                case 11: {
                        if (wireType !== 2)
                            break;
                        message.punchHoleResponse = $root.hbb.PunchHoleResponse.decode(reader, reader.uint32(), $undefined, _depth + 1, message.punchHoleResponse);
                        message.union = "punchHoleResponse";
                        continue;
                    }
                case 12: {
                        if (wireType !== 2)
                            break;
                        message.fetchLocalAddr = $root.hbb.FetchLocalAddr.decode(reader, reader.uint32(), $undefined, _depth + 1, message.fetchLocalAddr);
                        message.union = "fetchLocalAddr";
                        continue;
                    }
                case 13: {
                        if (wireType !== 2)
                            break;
                        message.localAddr = $root.hbb.LocalAddr.decode(reader, reader.uint32(), $undefined, _depth + 1, message.localAddr);
                        message.union = "localAddr";
                        continue;
                    }
                case 14: {
                        if (wireType !== 2)
                            break;
                        message.configureUpdate = $root.hbb.ConfigUpdate.decode(reader, reader.uint32(), $undefined, _depth + 1, message.configureUpdate);
                        message.union = "configureUpdate";
                        continue;
                    }
                case 15: {
                        if (wireType !== 2)
                            break;
                        message.registerPk = $root.hbb.RegisterPk.decode(reader, reader.uint32(), $undefined, _depth + 1, message.registerPk);
                        message.union = "registerPk";
                        continue;
                    }
                case 16: {
                        if (wireType !== 2)
                            break;
                        message.registerPkResponse = $root.hbb.RegisterPkResponse.decode(reader, reader.uint32(), $undefined, _depth + 1, message.registerPkResponse);
                        message.union = "registerPkResponse";
                        continue;
                    }
                case 17: {
                        if (wireType !== 2)
                            break;
                        message.softwareUpdate = $root.hbb.SoftwareUpdate.decode(reader, reader.uint32(), $undefined, _depth + 1, message.softwareUpdate);
                        message.union = "softwareUpdate";
                        continue;
                    }
                case 18: {
                        if (wireType !== 2)
                            break;
                        message.requestRelay = $root.hbb.RequestRelay.decode(reader, reader.uint32(), $undefined, _depth + 1, message.requestRelay);
                        message.union = "requestRelay";
                        continue;
                    }
                case 19: {
                        if (wireType !== 2)
                            break;
                        message.relayResponse = $root.hbb.RelayResponse.decode(reader, reader.uint32(), $undefined, _depth + 1, message.relayResponse);
                        message.union = "relayResponse";
                        continue;
                    }
                case 20: {
                        if (wireType !== 2)
                            break;
                        message.testNatRequest = $root.hbb.TestNatRequest.decode(reader, reader.uint32(), $undefined, _depth + 1, message.testNatRequest);
                        message.union = "testNatRequest";
                        continue;
                    }
                case 21: {
                        if (wireType !== 2)
                            break;
                        message.testNatResponse = $root.hbb.TestNatResponse.decode(reader, reader.uint32(), $undefined, _depth + 1, message.testNatResponse);
                        message.union = "testNatResponse";
                        continue;
                    }
                case 22: {
                        if (wireType !== 2)
                            break;
                        message.peerDiscovery = $root.hbb.PeerDiscovery.decode(reader, reader.uint32(), $undefined, _depth + 1, message.peerDiscovery);
                        message.union = "peerDiscovery";
                        continue;
                    }
                case 23: {
                        if (wireType !== 2)
                            break;
                        message.onlineRequest = $root.hbb.OnlineRequest.decode(reader, reader.uint32(), $undefined, _depth + 1, message.onlineRequest);
                        message.union = "onlineRequest";
                        continue;
                    }
                case 24: {
                        if (wireType !== 2)
                            break;
                        message.onlineResponse = $root.hbb.OnlineResponse.decode(reader, reader.uint32(), $undefined, _depth + 1, message.onlineResponse);
                        message.union = "onlineResponse";
                        continue;
                    }
                case 25: {
                        if (wireType !== 2)
                            break;
                        message.keyExchange = $root.hbb.KeyExchange.decode(reader, reader.uint32(), $undefined, _depth + 1, message.keyExchange);
                        message.union = "keyExchange";
                        continue;
                    }
                case 26: {
                        if (wireType !== 2)
                            break;
                        message.hc = $root.hbb.HealthCheck.decode(reader, reader.uint32(), $undefined, _depth + 1, message.hc);
                        message.union = "hc";
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (length !== $undefined) {
                if (reader.pos !== end)
                    throw $RangeError("index out of range");
                reader.len = length;
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a RendezvousMessage message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {hbb.RendezvousMessage & hbb.RendezvousMessage.$Shape} RendezvousMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RendezvousMessage.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a RendezvousMessage message.
         * @function verify
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        RendezvousMessage.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            let properties = {};
            if (message.registerPeer != null && $Object.hasOwnProperty.call(message, "registerPeer")) {
                properties.union = 1;
                {
                    let error = $root.hbb.RegisterPeer.verify(message.registerPeer, _depth + 1);
                    if (error)
                        return "registerPeer." + error;
                }
            }
            if (message.registerPeerResponse != null && $Object.hasOwnProperty.call(message, "registerPeerResponse")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.RegisterPeerResponse.verify(message.registerPeerResponse, _depth + 1);
                    if (error)
                        return "registerPeerResponse." + error;
                }
            }
            if (message.punchHoleRequest != null && $Object.hasOwnProperty.call(message, "punchHoleRequest")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.PunchHoleRequest.verify(message.punchHoleRequest, _depth + 1);
                    if (error)
                        return "punchHoleRequest." + error;
                }
            }
            if (message.punchHole != null && $Object.hasOwnProperty.call(message, "punchHole")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.PunchHole.verify(message.punchHole, _depth + 1);
                    if (error)
                        return "punchHole." + error;
                }
            }
            if (message.punchHoleSent != null && $Object.hasOwnProperty.call(message, "punchHoleSent")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.PunchHoleSent.verify(message.punchHoleSent, _depth + 1);
                    if (error)
                        return "punchHoleSent." + error;
                }
            }
            if (message.punchHoleResponse != null && $Object.hasOwnProperty.call(message, "punchHoleResponse")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.PunchHoleResponse.verify(message.punchHoleResponse, _depth + 1);
                    if (error)
                        return "punchHoleResponse." + error;
                }
            }
            if (message.fetchLocalAddr != null && $Object.hasOwnProperty.call(message, "fetchLocalAddr")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.FetchLocalAddr.verify(message.fetchLocalAddr, _depth + 1);
                    if (error)
                        return "fetchLocalAddr." + error;
                }
            }
            if (message.localAddr != null && $Object.hasOwnProperty.call(message, "localAddr")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.LocalAddr.verify(message.localAddr, _depth + 1);
                    if (error)
                        return "localAddr." + error;
                }
            }
            if (message.configureUpdate != null && $Object.hasOwnProperty.call(message, "configureUpdate")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.ConfigUpdate.verify(message.configureUpdate, _depth + 1);
                    if (error)
                        return "configureUpdate." + error;
                }
            }
            if (message.registerPk != null && $Object.hasOwnProperty.call(message, "registerPk")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.RegisterPk.verify(message.registerPk, _depth + 1);
                    if (error)
                        return "registerPk." + error;
                }
            }
            if (message.registerPkResponse != null && $Object.hasOwnProperty.call(message, "registerPkResponse")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.RegisterPkResponse.verify(message.registerPkResponse, _depth + 1);
                    if (error)
                        return "registerPkResponse." + error;
                }
            }
            if (message.softwareUpdate != null && $Object.hasOwnProperty.call(message, "softwareUpdate")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.SoftwareUpdate.verify(message.softwareUpdate, _depth + 1);
                    if (error)
                        return "softwareUpdate." + error;
                }
            }
            if (message.requestRelay != null && $Object.hasOwnProperty.call(message, "requestRelay")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.RequestRelay.verify(message.requestRelay, _depth + 1);
                    if (error)
                        return "requestRelay." + error;
                }
            }
            if (message.relayResponse != null && $Object.hasOwnProperty.call(message, "relayResponse")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.RelayResponse.verify(message.relayResponse, _depth + 1);
                    if (error)
                        return "relayResponse." + error;
                }
            }
            if (message.testNatRequest != null && $Object.hasOwnProperty.call(message, "testNatRequest")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.TestNatRequest.verify(message.testNatRequest, _depth + 1);
                    if (error)
                        return "testNatRequest." + error;
                }
            }
            if (message.testNatResponse != null && $Object.hasOwnProperty.call(message, "testNatResponse")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.TestNatResponse.verify(message.testNatResponse, _depth + 1);
                    if (error)
                        return "testNatResponse." + error;
                }
            }
            if (message.peerDiscovery != null && $Object.hasOwnProperty.call(message, "peerDiscovery")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.PeerDiscovery.verify(message.peerDiscovery, _depth + 1);
                    if (error)
                        return "peerDiscovery." + error;
                }
            }
            if (message.onlineRequest != null && $Object.hasOwnProperty.call(message, "onlineRequest")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.OnlineRequest.verify(message.onlineRequest, _depth + 1);
                    if (error)
                        return "onlineRequest." + error;
                }
            }
            if (message.onlineResponse != null && $Object.hasOwnProperty.call(message, "onlineResponse")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.OnlineResponse.verify(message.onlineResponse, _depth + 1);
                    if (error)
                        return "onlineResponse." + error;
                }
            }
            if (message.keyExchange != null && $Object.hasOwnProperty.call(message, "keyExchange")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.KeyExchange.verify(message.keyExchange, _depth + 1);
                    if (error)
                        return "keyExchange." + error;
                }
            }
            if (message.hc != null && $Object.hasOwnProperty.call(message, "hc")) {
                if (properties.union === 1)
                    return "union: multiple values";
                properties.union = 1;
                {
                    let error = $root.hbb.HealthCheck.verify(message.hc, _depth + 1);
                    if (error)
                        return "hc." + error;
                }
            }
            return null;
        };

        /**
         * Creates a RendezvousMessage message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {hbb.RendezvousMessage} RendezvousMessage
         */
        RendezvousMessage.fromObject = function (object, _depth) {
            if (object instanceof $root.hbb.RendezvousMessage)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".hbb.RendezvousMessage: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.hbb.RendezvousMessage();
            if (object.registerPeer != null) {
                if (!$util.isObject(object.registerPeer))
                    throw $TypeError(".hbb.RendezvousMessage.registerPeer: object expected");
                message.registerPeer = $root.hbb.RegisterPeer.fromObject(object.registerPeer, _depth + 1);
            }
            if (object.registerPeerResponse != null) {
                if (!$util.isObject(object.registerPeerResponse))
                    throw $TypeError(".hbb.RendezvousMessage.registerPeerResponse: object expected");
                message.registerPeerResponse = $root.hbb.RegisterPeerResponse.fromObject(object.registerPeerResponse, _depth + 1);
            }
            if (object.punchHoleRequest != null) {
                if (!$util.isObject(object.punchHoleRequest))
                    throw $TypeError(".hbb.RendezvousMessage.punchHoleRequest: object expected");
                message.punchHoleRequest = $root.hbb.PunchHoleRequest.fromObject(object.punchHoleRequest, _depth + 1);
            }
            if (object.punchHole != null) {
                if (!$util.isObject(object.punchHole))
                    throw $TypeError(".hbb.RendezvousMessage.punchHole: object expected");
                message.punchHole = $root.hbb.PunchHole.fromObject(object.punchHole, _depth + 1);
            }
            if (object.punchHoleSent != null) {
                if (!$util.isObject(object.punchHoleSent))
                    throw $TypeError(".hbb.RendezvousMessage.punchHoleSent: object expected");
                message.punchHoleSent = $root.hbb.PunchHoleSent.fromObject(object.punchHoleSent, _depth + 1);
            }
            if (object.punchHoleResponse != null) {
                if (!$util.isObject(object.punchHoleResponse))
                    throw $TypeError(".hbb.RendezvousMessage.punchHoleResponse: object expected");
                message.punchHoleResponse = $root.hbb.PunchHoleResponse.fromObject(object.punchHoleResponse, _depth + 1);
            }
            if (object.fetchLocalAddr != null) {
                if (!$util.isObject(object.fetchLocalAddr))
                    throw $TypeError(".hbb.RendezvousMessage.fetchLocalAddr: object expected");
                message.fetchLocalAddr = $root.hbb.FetchLocalAddr.fromObject(object.fetchLocalAddr, _depth + 1);
            }
            if (object.localAddr != null) {
                if (!$util.isObject(object.localAddr))
                    throw $TypeError(".hbb.RendezvousMessage.localAddr: object expected");
                message.localAddr = $root.hbb.LocalAddr.fromObject(object.localAddr, _depth + 1);
            }
            if (object.configureUpdate != null) {
                if (!$util.isObject(object.configureUpdate))
                    throw $TypeError(".hbb.RendezvousMessage.configureUpdate: object expected");
                message.configureUpdate = $root.hbb.ConfigUpdate.fromObject(object.configureUpdate, _depth + 1);
            }
            if (object.registerPk != null) {
                if (!$util.isObject(object.registerPk))
                    throw $TypeError(".hbb.RendezvousMessage.registerPk: object expected");
                message.registerPk = $root.hbb.RegisterPk.fromObject(object.registerPk, _depth + 1);
            }
            if (object.registerPkResponse != null) {
                if (!$util.isObject(object.registerPkResponse))
                    throw $TypeError(".hbb.RendezvousMessage.registerPkResponse: object expected");
                message.registerPkResponse = $root.hbb.RegisterPkResponse.fromObject(object.registerPkResponse, _depth + 1);
            }
            if (object.softwareUpdate != null) {
                if (!$util.isObject(object.softwareUpdate))
                    throw $TypeError(".hbb.RendezvousMessage.softwareUpdate: object expected");
                message.softwareUpdate = $root.hbb.SoftwareUpdate.fromObject(object.softwareUpdate, _depth + 1);
            }
            if (object.requestRelay != null) {
                if (!$util.isObject(object.requestRelay))
                    throw $TypeError(".hbb.RendezvousMessage.requestRelay: object expected");
                message.requestRelay = $root.hbb.RequestRelay.fromObject(object.requestRelay, _depth + 1);
            }
            if (object.relayResponse != null) {
                if (!$util.isObject(object.relayResponse))
                    throw $TypeError(".hbb.RendezvousMessage.relayResponse: object expected");
                message.relayResponse = $root.hbb.RelayResponse.fromObject(object.relayResponse, _depth + 1);
            }
            if (object.testNatRequest != null) {
                if (!$util.isObject(object.testNatRequest))
                    throw $TypeError(".hbb.RendezvousMessage.testNatRequest: object expected");
                message.testNatRequest = $root.hbb.TestNatRequest.fromObject(object.testNatRequest, _depth + 1);
            }
            if (object.testNatResponse != null) {
                if (!$util.isObject(object.testNatResponse))
                    throw $TypeError(".hbb.RendezvousMessage.testNatResponse: object expected");
                message.testNatResponse = $root.hbb.TestNatResponse.fromObject(object.testNatResponse, _depth + 1);
            }
            if (object.peerDiscovery != null) {
                if (!$util.isObject(object.peerDiscovery))
                    throw $TypeError(".hbb.RendezvousMessage.peerDiscovery: object expected");
                message.peerDiscovery = $root.hbb.PeerDiscovery.fromObject(object.peerDiscovery, _depth + 1);
            }
            if (object.onlineRequest != null) {
                if (!$util.isObject(object.onlineRequest))
                    throw $TypeError(".hbb.RendezvousMessage.onlineRequest: object expected");
                message.onlineRequest = $root.hbb.OnlineRequest.fromObject(object.onlineRequest, _depth + 1);
            }
            if (object.onlineResponse != null) {
                if (!$util.isObject(object.onlineResponse))
                    throw $TypeError(".hbb.RendezvousMessage.onlineResponse: object expected");
                message.onlineResponse = $root.hbb.OnlineResponse.fromObject(object.onlineResponse, _depth + 1);
            }
            if (object.keyExchange != null) {
                if (!$util.isObject(object.keyExchange))
                    throw $TypeError(".hbb.RendezvousMessage.keyExchange: object expected");
                message.keyExchange = $root.hbb.KeyExchange.fromObject(object.keyExchange, _depth + 1);
            }
            if (object.hc != null) {
                if (!$util.isObject(object.hc))
                    throw $TypeError(".hbb.RendezvousMessage.hc: object expected");
                message.hc = $root.hbb.HealthCheck.fromObject(object.hc, _depth + 1);
            }
            return message;
        };

        /**
         * Creates a plain object from a RendezvousMessage message. Also converts values to other types if specified.
         * @function toObject
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {hbb.RendezvousMessage} message RendezvousMessage
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        RendezvousMessage.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (message.registerPeer != null && $Object.hasOwnProperty.call(message, "registerPeer")) {
                object.registerPeer = $root.hbb.RegisterPeer.toObject(message.registerPeer, options, _depth + 1);
                if (options.oneofs)
                    object.union = "registerPeer";
            }
            if (message.registerPeerResponse != null && $Object.hasOwnProperty.call(message, "registerPeerResponse")) {
                object.registerPeerResponse = $root.hbb.RegisterPeerResponse.toObject(message.registerPeerResponse, options, _depth + 1);
                if (options.oneofs)
                    object.union = "registerPeerResponse";
            }
            if (message.punchHoleRequest != null && $Object.hasOwnProperty.call(message, "punchHoleRequest")) {
                object.punchHoleRequest = $root.hbb.PunchHoleRequest.toObject(message.punchHoleRequest, options, _depth + 1);
                if (options.oneofs)
                    object.union = "punchHoleRequest";
            }
            if (message.punchHole != null && $Object.hasOwnProperty.call(message, "punchHole")) {
                object.punchHole = $root.hbb.PunchHole.toObject(message.punchHole, options, _depth + 1);
                if (options.oneofs)
                    object.union = "punchHole";
            }
            if (message.punchHoleSent != null && $Object.hasOwnProperty.call(message, "punchHoleSent")) {
                object.punchHoleSent = $root.hbb.PunchHoleSent.toObject(message.punchHoleSent, options, _depth + 1);
                if (options.oneofs)
                    object.union = "punchHoleSent";
            }
            if (message.punchHoleResponse != null && $Object.hasOwnProperty.call(message, "punchHoleResponse")) {
                object.punchHoleResponse = $root.hbb.PunchHoleResponse.toObject(message.punchHoleResponse, options, _depth + 1);
                if (options.oneofs)
                    object.union = "punchHoleResponse";
            }
            if (message.fetchLocalAddr != null && $Object.hasOwnProperty.call(message, "fetchLocalAddr")) {
                object.fetchLocalAddr = $root.hbb.FetchLocalAddr.toObject(message.fetchLocalAddr, options, _depth + 1);
                if (options.oneofs)
                    object.union = "fetchLocalAddr";
            }
            if (message.localAddr != null && $Object.hasOwnProperty.call(message, "localAddr")) {
                object.localAddr = $root.hbb.LocalAddr.toObject(message.localAddr, options, _depth + 1);
                if (options.oneofs)
                    object.union = "localAddr";
            }
            if (message.configureUpdate != null && $Object.hasOwnProperty.call(message, "configureUpdate")) {
                object.configureUpdate = $root.hbb.ConfigUpdate.toObject(message.configureUpdate, options, _depth + 1);
                if (options.oneofs)
                    object.union = "configureUpdate";
            }
            if (message.registerPk != null && $Object.hasOwnProperty.call(message, "registerPk")) {
                object.registerPk = $root.hbb.RegisterPk.toObject(message.registerPk, options, _depth + 1);
                if (options.oneofs)
                    object.union = "registerPk";
            }
            if (message.registerPkResponse != null && $Object.hasOwnProperty.call(message, "registerPkResponse")) {
                object.registerPkResponse = $root.hbb.RegisterPkResponse.toObject(message.registerPkResponse, options, _depth + 1);
                if (options.oneofs)
                    object.union = "registerPkResponse";
            }
            if (message.softwareUpdate != null && $Object.hasOwnProperty.call(message, "softwareUpdate")) {
                object.softwareUpdate = $root.hbb.SoftwareUpdate.toObject(message.softwareUpdate, options, _depth + 1);
                if (options.oneofs)
                    object.union = "softwareUpdate";
            }
            if (message.requestRelay != null && $Object.hasOwnProperty.call(message, "requestRelay")) {
                object.requestRelay = $root.hbb.RequestRelay.toObject(message.requestRelay, options, _depth + 1);
                if (options.oneofs)
                    object.union = "requestRelay";
            }
            if (message.relayResponse != null && $Object.hasOwnProperty.call(message, "relayResponse")) {
                object.relayResponse = $root.hbb.RelayResponse.toObject(message.relayResponse, options, _depth + 1);
                if (options.oneofs)
                    object.union = "relayResponse";
            }
            if (message.testNatRequest != null && $Object.hasOwnProperty.call(message, "testNatRequest")) {
                object.testNatRequest = $root.hbb.TestNatRequest.toObject(message.testNatRequest, options, _depth + 1);
                if (options.oneofs)
                    object.union = "testNatRequest";
            }
            if (message.testNatResponse != null && $Object.hasOwnProperty.call(message, "testNatResponse")) {
                object.testNatResponse = $root.hbb.TestNatResponse.toObject(message.testNatResponse, options, _depth + 1);
                if (options.oneofs)
                    object.union = "testNatResponse";
            }
            if (message.peerDiscovery != null && $Object.hasOwnProperty.call(message, "peerDiscovery")) {
                object.peerDiscovery = $root.hbb.PeerDiscovery.toObject(message.peerDiscovery, options, _depth + 1);
                if (options.oneofs)
                    object.union = "peerDiscovery";
            }
            if (message.onlineRequest != null && $Object.hasOwnProperty.call(message, "onlineRequest")) {
                object.onlineRequest = $root.hbb.OnlineRequest.toObject(message.onlineRequest, options, _depth + 1);
                if (options.oneofs)
                    object.union = "onlineRequest";
            }
            if (message.onlineResponse != null && $Object.hasOwnProperty.call(message, "onlineResponse")) {
                object.onlineResponse = $root.hbb.OnlineResponse.toObject(message.onlineResponse, options, _depth + 1);
                if (options.oneofs)
                    object.union = "onlineResponse";
            }
            if (message.keyExchange != null && $Object.hasOwnProperty.call(message, "keyExchange")) {
                object.keyExchange = $root.hbb.KeyExchange.toObject(message.keyExchange, options, _depth + 1);
                if (options.oneofs)
                    object.union = "keyExchange";
            }
            if (message.hc != null && $Object.hasOwnProperty.call(message, "hc")) {
                object.hc = $root.hbb.HealthCheck.toObject(message.hc, options, _depth + 1);
                if (options.oneofs)
                    object.union = "hc";
            }
            return object;
        };

        /**
         * Converts this RendezvousMessage to JSON.
         * @function toJSON
         * @memberof hbb.RendezvousMessage
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        RendezvousMessage.prototype.toJSON = function() {
            return RendezvousMessage.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for RendezvousMessage
         * @function getTypeUrl
         * @memberof hbb.RendezvousMessage
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        RendezvousMessage.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/hbb.RendezvousMessage";
        };

        return RendezvousMessage;
    })();

    return hbb;
})();

export {
  $root as default
};
