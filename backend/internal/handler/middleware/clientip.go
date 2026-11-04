package middleware

import (
	"net/http"
	"net/netip"
	"strings"
)

// maxClientIPHeaderLen is the longest header value that is tried as an address; the
// longest valid textual IPv6 address is 45 bytes.
const maxClientIPHeaderLen = 64

// ClientIP returns a function that finds the caller's address, normalised for use as a
// rate-limit key (IPv4-mapped IPv6 unmapped, canonical form).
//
// With an empty header it is the TCP peer's address. With a header name (for example
// CF-Connecting-IP behind Cloudflare) it is that header's first value, if that is one
// plain IP address; anything else (missing, a list, a zone, too long) falls back to the
// peer. The header is trusted as sent: use it only when the server is reachable through
// the proxy alone.
func ClientIP(header string) func(*http.Request) string {
	return func(r *http.Request) string {
		if header != "" {
			if v := strings.TrimSpace(r.Header.Get(header)); v != "" && len(v) <= maxClientIPHeaderLen {
				if addr, err := netip.ParseAddr(v); err == nil && addr.Zone() == "" {
					return addr.Unmap().String()
				}
			}
		}
		return peerIP(r.RemoteAddr)
	}
}

// peerIP is remoteAddr without its port, normalised. An address that does not parse is
// returned as it is.
func peerIP(remoteAddr string) string {
	if ap, err := netip.ParseAddrPort(remoteAddr); err == nil {
		return ap.Addr().WithZone("").Unmap().String()
	}
	if addr, err := netip.ParseAddr(remoteAddr); err == nil {
		return addr.WithZone("").Unmap().String()
	}
	return remoteAddr
}
