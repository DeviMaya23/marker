package domain

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSearchCursor_RoundTrip(t *testing.T) {
	fp := SearchFingerprint("go", false, nil)
	for _, offset := range []int{0, 1, 50, MaxSearchOffset} {
		s := EncodeSearchCursor(offset, fp)
		require.NotContains(t, s, "=")
		got, err := DecodeSearchCursor(s, fp)
		require.NoError(t, err)
		require.Equal(t, offset, got)
	}
}

func TestSearchFingerprint(t *testing.T) {
	f1, f2 := uuid.New(), uuid.New()
	base := SearchFingerprint("go", false, nil)
	require.Len(t, base, 16)
	require.Equal(t, base, SearchFingerprint("go", false, nil), "same inputs, same fingerprint")
	require.Equal(t, base, SearchFingerprint("  go\t\n", false, nil), "surrounding whitespace is trimmed")

	tests := []struct {
		name string
		got  string
	}{
		{"other q", SearchFingerprint("rust", false, nil)},
		{"inner whitespace differs", SearchFingerprint("g o", false, nil)},
		{"include_notes flipped", SearchFingerprint("go", true, nil)},
		{"folder set", SearchFingerprint("go", false, &f1)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) { require.NotEqual(t, base, tt.got) })
	}
	require.NotEqual(t, SearchFingerprint("go", false, &f1), SearchFingerprint("go", false, &f2), "other folder")
}

func TestDecodeSearchCursor_Rejects(t *testing.T) {
	enc := func(s string) string { return base64.RawURLEncoding.EncodeToString([]byte(s)) }
	fp := SearchFingerprint("go", false, nil)
	valid := EncodeSearchCursor(10, fp)
	live := EncodeCursor(Cursor{Mode: ListLive, At: time.Now(), ID: uuid.New()})
	trash := EncodeCursor(Cursor{Mode: ListTrash, At: time.Now(), ID: uuid.New()})

	tests := []struct {
		name   string
		cursor string
	}{
		{"over 512 characters", strings.Repeat("A", MaxCursorLength+1)},
		{"not base64url", "not base64url!!"},
		{"padded base64", valid + "="},
		{"non-JSON", enc("hello")},
		{"wrong shape", enc(`["search"]`)},
		{"unknown key", enc(`{"k":"search","o":1,"f":"` + fp + `","x":1}`)},
		{"missing kind", enc(`{"o":1,"f":"` + fp + `"}`)},
		{"missing offset", enc(`{"k":"search","f":"` + fp + `"}`)},
		{"missing fingerprint", enc(`{"k":"search","o":1}`)},
		{"wrong kind", enc(`{"k":"live","o":1,"f":"` + fp + `"}`)},
		{"offset not an integer", enc(`{"k":"search","o":1.5,"f":"` + fp + `"}`)},
		{"negative offset", EncodeSearchCursor(-1, fp)},
		{"offset 100,001", EncodeSearchCursor(MaxSearchOffset+1, fp)},
		{"fingerprint of another request", EncodeSearchCursor(1, SearchFingerprint("rust", false, nil))},
		{"plain-list cursor", live},
		{"trash cursor", trash},
		{"trailing data", enc(`{"k":"search","o":1,"f":"` + fp + `"}{}`)},
		{"empty", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := DecodeSearchCursor(tt.cursor, fp)
			require.ErrorIs(t, err, ErrInvalidCursor)
		})
	}
}

func TestSearchCursor_NotAcceptedByPlainDecoder(t *testing.T) {
	s := EncodeSearchCursor(5, SearchFingerprint("go", false, nil))
	for _, mode := range []ListMode{ListLive, ListTrash} {
		_, err := DecodeCursor(s, mode)
		require.ErrorIs(t, err, ErrInvalidCursor)
	}
}
