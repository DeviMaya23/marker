package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

// runBodyKeys sends body through recordBodyKeys and returns what the next handler saw.
func runBodyKeys(t *testing.T, body string) (keys bodyKeys, recorded bool, bodyAfter string) {
	t.Helper()
	e := echo.New()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body))
	c := e.NewContext(req, httptest.NewRecorder())
	err := recordBodyKeys(func(c echo.Context) error {
		keys, recorded = bodyKeysFrom(c.Request().Context())
		b, readErr := io.ReadAll(c.Request().Body)
		require.NoError(t, readErr)
		bodyAfter = string(b)
		return nil
	})(c)
	require.NoError(t, err)
	return keys, recorded, bodyAfter
}

func TestRecordBodyKeys(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		recorded bool
		want     bodyKeys
	}{
		{"empty object", `{}`, true, bodyKeys{}},
		{"absent key is not recorded", `{"title":"x"}`, true, bodyKeys{"title": false}},
		{"null is recorded as null", `{"note":null}`, true, bodyKeys{"note": true}},
		{"empty string is a value, not null", `{"note":""}`, true, bodyKeys{"note": false}},
		{"string 'null' is a value", `{"note":"null"}`, true, bodyKeys{"note": false}},
		{"unknown keys are recorded", `{"url":"x","foo":null}`, true, bodyKeys{"url": false, "foo": true}},
		{"last duplicate wins: null after value", `{"note":"x","note":null}`, true, bodyKeys{"note": true}},
		{"last duplicate wins: value after null", `{"note":null,"note":"x"}`, true, bodyKeys{"note": false}},
		{"json null body is no keys", `null`, true, bodyKeys{}},
		{"empty body is no keys", ``, true, bodyKeys{}},
		{"array records nothing", `[1]`, false, nil},
		{"string records nothing", `"x"`, false, nil},
		{"malformed records nothing", `{"note":`, false, nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			keys, recorded, after := runBodyKeys(t, tc.body)
			require.Equal(t, tc.recorded, recorded)
			require.Equal(t, tc.want, keys)
			require.Equal(t, tc.body, after, "the body is handed on unchanged")
		})
	}
}

func TestRecordBodyKeys_PassesBodyReadErrorsOn(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodPatch, "/", io.NopCloser(errReader{}))
	c := e.NewContext(req, httptest.NewRecorder())
	called := false
	err := recordBodyKeys(func(echo.Context) error { called = true; return nil })(c)
	require.Error(t, err)
	require.False(t, called)
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }
