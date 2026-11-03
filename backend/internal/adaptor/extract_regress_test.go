package adaptor

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Regression probes for the second verification pass: dropping the space after every
// text node must not glue words together that sit in separate text or block nodes.
func TestExtractPage_SecondPassRegressions(t *testing.T) {
	cases := []struct{ name, doc, want string }{
		{"newline between inline links", "<body><a>One</a>\n<a>Two</a></body>", "One Two"},
		{"text after a script element", "<body>a<script>x()</script>b</body>", "ab"},
		{"nav between blocks", "<body><p>a</p><nav>menu</nav><p>b</p></body>", "a b"},
		{"definition list", "<body><dl><dt>k</dt><dd>v</dd></dl></body>", "k v"},
		{"headings", "<body><h1>A</h1><h2>B</h2></body>", "A B"},
		{"nested inline keeps word", "<body><p>un<em>be<strong>liev</strong></em>able</p></body>", "unbelievable"},
		{"empty body", "<body></body>", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.want, extract(t, c.doc).Text)
		})
	}
}
