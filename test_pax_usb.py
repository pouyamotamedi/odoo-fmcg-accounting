"""
Test script: Check if PAX S800 responds on COM5 via USB Serial.

This sends a simple POSLink "Initialize" (A00) command to the terminal
and checks if we get any response back.
"""
import serial
import time

# POSLink framing constants
STX = 0x02
ETX = 0x03
FS = 0x1C
ACK = 0x06

def lrc(payload: bytes) -> int:
    """XOR checksum."""
    result = 0
    for b in payload:
        result ^= b
    return result

def build_packet(fields):
    """Build a POSLink packet from fields."""
    body = bytearray()
    body.append(STX)
    joined = chr(FS).join(fields).encode('ascii')
    body.extend(joined)
    body.append(ETX)
    body.append(lrc(bytes(body[1:])))
    return bytes(body)

def main():
    port = 'COM5'
    baud = 9600  # PAX default baud rate for USB serial

    print(f"[*] Opening {port} at {baud} baud...")
    
    try:
        ser = serial.Serial(
            port=port,
            baudrate=baud,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=5,  # 5 second read timeout
        )
    except serial.SerialException as e:
        print(f"[!] Cannot open {port}: {e}")
        return

    print(f"[+] Port opened successfully: {ser.name}")
    
    # Flush any garbage
    ser.reset_input_buffer()
    ser.reset_output_buffer()
    time.sleep(0.5)

    # Send A00 - Initialize command (simplest POSLink command)
    # This asks the terminal to report its status
    init_packet = build_packet(["A00", "1.28"])
    
    print(f"[*] Sending Initialize (A00) command...")
    print(f"    Raw bytes: {init_packet.hex()}")
    
    ser.write(init_packet)
    ser.flush()
    
    # Wait for response
    print(f"[*] Waiting for response (5 sec timeout)...")
    time.sleep(1)
    
    response = ser.read(1024)
    
    if response:
        print(f"[+] Got response! ({len(response)} bytes)")
        print(f"    Raw hex: {response.hex()}")
        print(f"    Raw ascii: {response.decode('ascii', errors='replace')}")
        
        # Check for ACK
        if response[0] == ACK:
            print("[+] Terminal sent ACK - communication working!")
        else:
            print(f"[?] First byte: 0x{response[0]:02x}")
    else:
        print("[!] No response received (timeout)")
        print("    Possible reasons:")
        print("    - Baud rate mismatch (try 115200 or 19200)")
        print("    - Terminal not in ECR/serial mode")
        print("    - USB port is for charging/download only")

    # Try other common baud rates if no response
    if not response:
        for baud_try in [115200, 19200, 38400, 57600]:
            ser.baudrate = baud_try
            ser.reset_input_buffer()
            time.sleep(0.3)
            print(f"\n[*] Trying baud rate {baud_try}...")
            ser.write(init_packet)
            ser.flush()
            time.sleep(2)
            resp = ser.read(1024)
            if resp:
                print(f"[+] Got response at {baud_try} baud! ({len(resp)} bytes)")
                print(f"    Raw hex: {resp.hex()}")
                break
        else:
            print("\n[!] No response at any baud rate.")
            print("    The USB port might not support ECR communication.")

    ser.close()
    print("\n[*] Done.")

if __name__ == '__main__':
    main()
