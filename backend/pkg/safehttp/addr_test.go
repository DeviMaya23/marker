package safehttp

import (
	"net/netip"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsBlockedIP(t *testing.T) {
	blocked := []string{
		// loopback
		"127.0.0.1", "127.255.255.254", "::1",
		// private
		"10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "fc00::1", "fd00:ec2::254",
		// link-local, including the cloud metadata address
		"169.254.169.254", "169.254.0.1", "fe80::1", "fe80::1%eth0",
		// unspecified and "this network"
		"0.0.0.0", "0.1.2.3", "::",
		// multicast and broadcast, reserved
		"224.0.0.1", "ff02::1", "255.255.255.255", "240.0.0.1",
		// shared, benchmarking, documentation
		"100.64.0.1", "198.18.0.1", "192.0.2.1", "2001:db8::1",
		// IPv4-mapped IPv6 is judged as the IPv4 address
		"::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254",
		// IPv6 forms that embed IPv4
		"64:ff9b::7f00:1", "2002:7f00:1::",
	}
	for _, s := range blocked {
		t.Run("blocked/"+s, func(t *testing.T) {
			assert.True(t, isBlockedIP(netip.MustParseAddr(s), false))
		})
	}

	allowed := []string{
		"8.8.8.8", "1.1.1.1", "93.184.216.34",
		"172.15.255.255", "172.32.0.1", // just outside 172.16.0.0/12
		"2606:4700:4700::1111", "2001:4860:4860::8888",
		"::ffff:8.8.8.8",
	}
	for _, s := range allowed {
		t.Run("allowed/"+s, func(t *testing.T) {
			assert.False(t, isBlockedIP(netip.MustParseAddr(s), false))
		})
	}
}

func TestIsBlockedIP_AllowLoopbackOnlyExemptsLoopback(t *testing.T) {
	assert.False(t, isBlockedIP(netip.MustParseAddr("127.0.0.1"), true))
	assert.False(t, isBlockedIP(netip.MustParseAddr("::1"), true))
	assert.False(t, isBlockedIP(netip.MustParseAddr("::ffff:127.0.0.1"), true))

	assert.True(t, isBlockedIP(netip.MustParseAddr("10.0.0.1"), true))
	assert.True(t, isBlockedIP(netip.MustParseAddr("169.254.169.254"), true))
	assert.True(t, isBlockedIP(netip.Addr{}, true), "invalid address is blocked")
}

func TestConfigControl(t *testing.T) {
	prod := config{}
	tests := []struct {
		name    string
		cfg     config
		address string
		wantErr error
	}{
		{"public on 80", prod, "8.8.8.8:80", nil},
		{"public on 443", prod, "8.8.8.8:443", nil},
		{"public on ipv6 443", prod, "[2606:4700:4700::1111]:443", nil},
		{"public on 8080", prod, "8.8.8.8:8080", ErrBlockedPort},
		{"private", prod, "10.0.0.1:80", ErrBlockedAddress},
		{"loopback v6", prod, "[::1]:443", ErrBlockedAddress},
		{"metadata", prod, "169.254.169.254:80", ErrBlockedAddress},
		{"unparsable", prod, "nonsense", ErrBlockedAddress},
		{"test mode allows loopback on any port", config{allowLoopback: true, anyPort: true}, "127.0.0.1:54321", nil},
		{"test mode still blocks private", config{allowLoopback: true, anyPort: true}, "10.0.0.1:54321", ErrBlockedAddress},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			network := "tcp4"
			if len(tt.address) > 0 && tt.address[0] == '[' {
				network = "tcp6"
			}
			err := tt.cfg.control(network, tt.address, nil)
			if tt.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			assert.ErrorIs(t, err, tt.wantErr)
		})
	}
}
