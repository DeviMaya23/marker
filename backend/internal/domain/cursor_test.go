package domain

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCursor_RoundTrip(t *testing.T) {
	id := NewID()
	// Nanosecond precision, in a non-UTC zone: the cursor must come back identical in UTC.
	at := time.Date(2026, 3, 4, 5, 6, 7, 123456789, time.FixedZone("x", 3*3600))

	for _, mode := range []ListMode{ListLive, ListTrash} {
		t.Run(string(mode), func(t *testing.T) {
			s := EncodeCursor(Cursor{Mode: mode, At: at, ID: id})
			require.NotContains(t, s, "=")

			got, err := DecodeCursor(s, mode)
			require.NoError(t, err)
			require.Equal(t, mode, got.Mode)
			require.Equal(t, id, got.ID)
			require.True(t, got.At.Equal(at), "got %s want %s", got.At, at)
			require.Equal(t, at.UnixNano(), got.At.UnixNano())
			require.Equal(t, time.UTC, got.At.Location())
		})
	}
}

func TestDecodeCursor_Rejects(t *testing.T) {
	enc := func(s string) string { return base64.RawURLEncoding.EncodeToString([]byte(s)) }
	id := uuid.NewString()
	valid := EncodeCursor(Cursor{Mode: ListLive, At: time.Now(), ID: uuid.New()})
	validTrash := EncodeCursor(Cursor{Mode: ListTrash, At: time.Now(), ID: uuid.New()})

	tests := []struct {
		name   string
		cursor string
		mode   ListMode
	}{
		{"over 512 characters", strings.Repeat("A", MaxCursorLength+1), ListLive},
		{"not base64url", "not base64url!!", ListLive},
		{"padded base64", valid + "=", ListLive},
		{"base64url of non-JSON", enc("hello"), ListLive},
		{"JSON of the wrong shape", enc(`["live"]`), ListLive},
		{"unknown field", enc(`{"m":"live","t":"2026-01-01T00:00:00Z","id":"` + id + `","x":1}`), ListLive},
		{"trailing data", enc(`{"m":"live","t":"2026-01-01T00:00:00Z","id":"` + id + `"}{}`), ListLive},
		{"missing timestamp", enc(`{"m":"live","id":"` + id + `"}`), ListLive},
		{"unparseable timestamp", enc(`{"m":"live","t":"yesterday","id":"` + id + `"}`), ListLive},
		{"id not a UUID", enc(`{"m":"live","t":"2026-01-01T00:00:00Z","id":"42"}`), ListLive},
		{"missing id", enc(`{"m":"live","t":"2026-01-01T00:00:00Z"}`), ListLive},
		{"missing mode", enc(`{"t":"2026-01-01T00:00:00Z","id":"` + id + `"}`), ListLive},
		{"live cursor used for the trash", valid, ListTrash},
		{"trash cursor used for the live list", validTrash, ListLive},
		{"empty", "", ListLive},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := DecodeCursor(tt.cursor, tt.mode)
			require.ErrorIs(t, err, ErrInvalidCursor)
		})
	}
}

func TestDecodeCursor_LengthLimitIsExactly512(t *testing.T) {
	id := uuid.NewString()
	// Pad the JSON with spaces so the encoded form is exactly 512 characters.
	base := `{"m":"live","t":"2026-01-01T00:00:00Z","id":"` + id + `"}`
	pad := func(encodedLen int) string {
		for n := 0; ; n++ {
			s := enc(base + strings.Repeat(" ", n))
			if len(s) >= encodedLen {
				return s
			}
		}
	}
	at512 := pad(MaxCursorLength)
	require.Len(t, at512, MaxCursorLength)
	_, err := DecodeCursor(at512, ListLive)
	require.NoError(t, err)

	_, err = DecodeCursor(pad(MaxCursorLength+1), ListLive)
	require.ErrorIs(t, err, ErrInvalidCursor)
}

func enc(s string) string { return base64.RawURLEncoding.EncodeToString([]byte(s)) }
