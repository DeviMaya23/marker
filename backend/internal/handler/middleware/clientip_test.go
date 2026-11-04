package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func reqFrom(remote string, headers ...string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = remote
	for i := 0; i < len(headers); i += 2 {
		r.Header.Add(headers[i], headers[i+1])
	}
	return r
}

func TestClientIP_NoHeaderSetting(t *testing.T) {
	ip := ClientIP("")
	require.Equal(t, "203.0.113.7", ip(reqFrom("203.0.113.7:4321")))
	require.Equal(t, "::1", ip(reqFrom("[::1]:1234")))
	require.Equal(t, "203.0.113.7", ip(reqFrom("203.0.113.7:4321", "X-Forwarded-For", "9.9.9.9", "CF-Connecting-IP", "8.8.8.8")))
}

func TestClientIP_Header(t *testing.T) {
	ip := ClientIP("CF-Connecting-IP")
	const peer = "203.0.113.7:4321"
	tests := []struct {
		name   string
		header []string
		want   string
	}{
		{"valid", []string{"CF-Connecting-IP", "1.2.3.4"}, "1.2.3.4"},
		{"surrounding spaces", []string{"CF-Connecting-IP", "  1.2.3.4 "}, "1.2.3.4"},
		{"IPv6", []string{"CF-Connecting-IP", " ::1 "}, "::1"},
		{"missing", nil, "203.0.113.7"},
		{"not an ip", []string{"CF-Connecting-IP", "not-an-ip"}, "203.0.113.7"},
		{"empty", []string{"CF-Connecting-IP", ""}, "203.0.113.7"},
		{"a list", []string{"CF-Connecting-IP", "1.2.3.4, 5.6.7.8"}, "203.0.113.7"},
		{"with a port", []string{"CF-Connecting-IP", "1.2.3.4:80"}, "203.0.113.7"},
		{"zoned address", []string{"CF-Connecting-IP", "fe80::1%eth0"}, "203.0.113.7"},
		{"65 bytes", []string{"CF-Connecting-IP", strings.Repeat("0", 65-len("::1")) + "::1"}, "203.0.113.7"},
		{"two headers use the first", []string{"CF-Connecting-IP", "1.2.3.4", "CF-Connecting-IP", "5.6.7.8"}, "1.2.3.4"},
		{"another header is ignored", []string{"X-Forwarded-For", "1.2.3.4"}, "203.0.113.7"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, ip(reqFrom(peer, tt.header...)))
		})
	}
}

func TestClientIP_Normalisation(t *testing.T) {
	ip := ClientIP("CF-Connecting-IP")
	require.Equal(t, "1.2.3.4", ip(reqFrom("[::ffff:1.2.3.4]:80")))
	require.Equal(t, "1.2.3.4", ip(reqFrom("203.0.113.7:1", "CF-Connecting-IP", "::ffff:1.2.3.4")))
	require.Equal(t, ip(reqFrom("1.2.3.4:80")), ip(reqFrom("[::ffff:1.2.3.4]:80")))
	require.Equal(t, "2001:db8::1", ip(reqFrom("203.0.113.7:1", "CF-Connecting-IP", "2001:0DB8:0:0:0:0:0:1")))
}

func TestClientIP_UnparsableRemoteAddr(t *testing.T) {
	require.Equal(t, "@", ClientIP("")(reqFrom("@")))
}
