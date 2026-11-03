package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Regression probes for the second verification pass: the query rewrite must keep the
// old behavior for ordinary URLs.
func TestNormalizeURL_SecondPassRegressions(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"IPv6 literal with default port", "http://[::1]:80/a/", "https://[::1]/a"},
		{"IPv6 literal with other port", "https://[2001:db8::1]:8443/a", "https://[2001:db8::1]:8443/a"},
		{"userinfo kept", "https://u:p@E.com:443/a", "https://u:p@e.com/a"},
		{"key without value equals empty value", "https://e.com/a?flag", "https://e.com/a?flag="},
		{"empty pairs dropped", "https://e.com/a?&&b=1&", "https://e.com/a?b=1"},
		{"tracking removed next to a bad escape", "https://e.com/a?utm_x=1&q=%zz", "https://e.com/a?q=%zz"},
		{"tracking name is case-insensitive as before", "https://e.com/a?UTM_x=1", "https://e.com/a"},
		{"encoded tracking key still removed", "https://e.com/a?utm%5Fx=1&id=2", "https://e.com/a?id=2"},
		{"root path", "https://e.com/", "https://e.com"},
		{"plus and %20 agree", "https://e.com/a?q=a+b", "https://e.com/a?q=a+b"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := NormalizeURL(c.in)
			require.NoError(t, err)
			require.Equal(t, c.want, got)
		})
	}
}
