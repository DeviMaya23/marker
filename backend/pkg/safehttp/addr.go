package safehttp

import "net/netip"

// blockedPrefixes are ranges that the netip helpers (IsPrivate, IsLoopback,
// IsLinkLocalUnicast and so on) do not already cover.
var blockedPrefixes = mustPrefixes(
	// IPv4
	"0.0.0.0/8",       // "this network"
	"100.64.0.0/10",   // carrier-grade NAT
	"192.0.0.0/24",    // IETF protocol assignments
	"192.0.2.0/24",    // documentation
	"198.18.0.0/15",   // benchmarking
	"198.51.100.0/24", // documentation
	"203.0.113.0/24",  // documentation
	"240.0.0.0/4",     // reserved, includes broadcast
	// IPv6
	"::/8",           // unspecified, loopback, deprecated IPv4-compatible
	"64:ff9b::/96",   // NAT64, embeds an IPv4 address
	"64:ff9b:1::/48", // local-use NAT64
	"100::/64",       // discard-only
	"2001::/32",      // Teredo
	"2001:db8::/32",  // documentation
	"2002::/16",      // 6to4, embeds an IPv4 address
)

func mustPrefixes(list ...string) []netip.Prefix {
	out := make([]netip.Prefix, len(list))
	for i, s := range list {
		out[i] = netip.MustParsePrefix(s)
	}
	return out
}

// isBlockedIP reports whether the server must not connect to ip. IPv4-mapped
// IPv6 addresses are judged as the IPv4 address they carry. allowLoopback only
// exempts loopback itself; it is false outside tests.
func isBlockedIP(ip netip.Addr, allowLoopback bool) bool {
	if !ip.IsValid() {
		return true
	}
	ip = ip.WithZone("").Unmap()
	if ip.IsLoopback() {
		return !allowLoopback
	}
	if ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified() {
		return true
	}
	for _, p := range blockedPrefixes {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}
