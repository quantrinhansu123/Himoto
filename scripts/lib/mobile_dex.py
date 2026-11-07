"""Read a DEX class's defined no-argument constructor, not just its name."""
import struct


def has_constructor(data, descriptor):
    assert data.startswith(b'dex\n'), 'Invalid Android DEX'

    def uint(offset):
        return struct.unpack_from('<I', data, offset)[0]

    def uleb(offset):
        value = shift = 0
        while True:
            byte = data[offset]
            offset += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value, offset
            shift += 7
            assert shift < 35, 'Invalid DEX ULEB128'

    string_count, strings_at = uint(0x38), uint(0x3c)
    strings = []
    for index in range(string_count):
        _, start = uleb(uint(strings_at + 4 * index))
        strings.append(data[start:data.index(0, start)])
    type_count, types_at = uint(0x40), uint(0x44)
    types = [strings[uint(types_at + index * 4)] for index in range(type_count)]
    target = descriptor.encode('ascii')
    if target not in types:
        return False
    target_type = types.index(target)
    method_count, methods_at = uint(0x58), uint(0x5c)
    protos_at = uint(0x4c)
    constructors = set()
    for index in range(method_count):
        owner, proto, name = struct.unpack_from('<HHI', data, methods_at + index * 8)
        if owner == target_type and strings[name] == b'<init>':
            proto_at = protos_at + 12 * proto
            params = uint(proto_at + 8)
            if types[uint(proto_at + 4)] == b'V' and (not params or uint(params) == 0):
                constructors.add(index)
    classes_at = uint(0x64)
    for index in range(uint(0x60)):
        entry = classes_at + index * 32
        if uint(entry) != target_type:
            continue
        offset = uint(entry + 24)
        if not offset:
            return False
        sizes = []
        for _ in range(4):
            count, offset = uleb(offset)
            sizes.append(count)
        for _ in range(sizes[0] + sizes[1]):
            _, offset = uleb(offset)
            _, offset = uleb(offset)
        for count in sizes[2:]:
            method = 0
            for _ in range(count):
                delta, offset = uleb(offset)
                method += delta
                _, offset = uleb(offset)
                code, offset = uleb(offset)
                if method in constructors and code:
                    return True
        return False
    return False
