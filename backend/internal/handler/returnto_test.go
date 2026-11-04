package handler

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSafeReturnTo(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty defaults to root", "", "/"},
		{"root", "/", "/"},
		{"relative path", "/folders/123", "/folders/123"},
		{"path with query", "/search?q=go&folder=1", "/search?q=go&folder=1"},
		{"protocol-relative URL", "//evil.example", "/"},
		{"absolute URL", "https://evil.example/", "/"},
		{"scheme without slashes", "https:evil.example", "/"},
		{"no leading slash", "evil.example", "/"},
		{"backslash trick", "/\\evil.example", "/"},
		{"slash then backslash", "\\/evil.example", "/"},
		{"header injection", "/ok\r\nSet-Cookie: x=1", "/"},
		{"newline", "/ok\nnext", "/"},
		{"exactly the length cap is kept", "/" + strings.Repeat("a", maxReturnToLen-1), "/" + strings.Repeat("a", maxReturnToLen-1)},
		{"one byte over the length cap", "/" + strings.Repeat("a", maxReturnToLen), "/"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, safeReturnTo(tt.in))
		})
	}
}
