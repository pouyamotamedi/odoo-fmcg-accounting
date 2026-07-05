"""PAX POSLink protocol helper (TCP/IP semi-integrated mode).

Implements the minimal subset of the PAX POSLink protocol needed to send a
credit sale (DoCredit) to a PAX S800 terminal over TCP and parse the response.

Framing:
    <STX> <command-fields separated by FS> <ETX> <LRC>

Where:
    STX = 0x02, ETX = 0x03, FS = 0x1C
    LRC = XOR of every byte after STX up to and including ETX.

The response uses the same framing. Fields are separated by FS and the packet
is prefixed with an ACK (0x06) from the terminal.
"""
import logging
import socket

_logger = logging.getLogger(__name__)

STX = 0x02
ETX = 0x03
FS = 0x1C
ACK = 0x06
NAK = 0x15

# POSLink transaction types for the "T00" (Trans) command group.
TRANS_TYPE_SALE = "01"      # Credit sale
TRANS_TYPE_RETURN = "02"    # Credit return / refund
TRANS_TYPE_VOID = "16"      # Void


def _lrc(payload: bytes) -> int:
    """Compute the LRC (XOR) checksum over the given bytes."""
    lrc = 0
    for b in payload:
        lrc ^= b
    return lrc


def build_packet(fields):
    """Build a framed POSLink request packet from a list of string fields."""
    body = bytearray()
    body.append(STX)
    joined = chr(FS).join(fields).encode("ascii")
    body.extend(joined)
    body.append(ETX)
    # LRC is computed over everything after STX, including ETX.
    lrc = _lrc(bytes(body[1:]))
    body.append(lrc)
    return bytes(body)


def parse_packet(raw: bytes):
    """Parse a framed POSLink response into a list of fields.

    Strips a leading ACK if present, validates STX/ETX framing and returns the
    FS-separated fields as a list of strings.
    """
    if not raw:
        raise ValueError("empty response from terminal")
    data = raw
    if data[0] == ACK:
        data = data[1:]
    if not data or data[0] != STX:
        raise ValueError("invalid response framing (missing STX)")
    try:
        etx_index = data.index(ETX)
    except ValueError:
        raise ValueError("invalid response framing (missing ETX)")
    inner = data[1:etx_index]
    return inner.decode("ascii", errors="replace").split(chr(FS))


def do_credit_sale(ip, port, amount_cents, trans_type=TRANS_TYPE_SALE,
                   ecr_ref="1", timeout=90):
    """Send a credit sale to the PAX terminal and return a parsed result.

    Args:
        ip: terminal IP address.
        port: terminal TCP port (default PAX ECR port is 10009).
        amount_cents: transaction amount as an integer number of minor units.
        trans_type: POSLink transaction type ("01" sale, "02" return).
        ecr_ref: ECR reference / transaction number.
        timeout: socket timeout in seconds (card entry can take a while).

    Returns:
        dict with keys: success (bool), result_code, message, raw (list).
    """
    # Command "T00" = Do Transaction. Fields per POSLink spec (simplified):
    #   [command, version, transType, amountInformation, ...]
    amount_information = str(int(amount_cents))
    fields = [
        "T00",           # transaction command
        "1.28",          # protocol version
        trans_type,      # transaction type
        amount_information,  # base amount in minor units
        ecr_ref,         # ECR reference number
    ]
    packet = build_packet(fields)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((ip, int(port)))
        sock.sendall(packet)
        chunks = []
        # Read until we see an ETX + LRC (2 bytes after ETX at most).
        while True:
            chunk = sock.recv(2048)
            if not chunk:
                break
            chunks.append(chunk)
            if ETX in b"".join(chunks):
                # read one more byte for the LRC then stop
                try:
                    chunks.append(sock.recv(1))
                except socket.timeout:
                    pass
                break
        raw = b"".join(chunks)
    finally:
        try:
            sock.close()
        except OSError:
            pass

    parsed = parse_packet(raw)
    # By convention field[3] carries a result code, field[4] a message.
    result_code = parsed[3] if len(parsed) > 3 else ""
    message = parsed[4] if len(parsed) > 4 else ""
    success = result_code in ("000000", "0", "00")
    return {
        "success": success,
        "result_code": result_code,
        "message": message,
        "raw": parsed,
    }
