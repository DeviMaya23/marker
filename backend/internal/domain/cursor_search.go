package domain

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
)

// SearchCursorKind is the kind a search cursor carries.
const SearchCursorKind = "search"

// MaxSearchOffset is the largest offset a search cursor may hold.
const MaxSearchOffset = 100000

// MaxSearchQueryLength is the longest query, in characters after trimming.
const MaxSearchQueryLength = 200

type searchCursorWire struct {
	Kind        *string `json:"k"`
	Offset      *int    `json:"o"`
	Fingerprint *string `json:"f"`
}

// SearchFingerprint identifies one search request: the first 8 bytes of the SHA-256 of
// the trimmed query, include_notes and the folder id (or none), as hex. A cursor is only
// valid for the request it was made for.
func SearchFingerprint(q string, includeNotes bool, folderID *uuid.UUID) string {
	folder := "-"
	if folderID != nil {
		folder = folderID.String()
	}
	notes := "0"
	if includeNotes {
		notes = "1"
	}
	// The query goes last so its content cannot blur into the other fields.
	sum := sha256.Sum256([]byte(notes + "\x00" + folder + "\x00" + strings.TrimSpace(q)))
	return hex.EncodeToString(sum[:8])
}

// EncodeSearchCursor returns the opaque cursor for the page starting at offset:
// base64url, without padding, of a small JSON object.
func EncodeSearchCursor(offset int, fingerprint string) string {
	kind := SearchCursorKind
	raw, err := json.Marshal(searchCursorWire{Kind: &kind, Offset: &offset, Fingerprint: &fingerprint})
	if err != nil {
		// Marshalling plain values cannot fail.
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

// DecodeSearchCursor returns the offset of a cursor made by EncodeSearchCursor for the
// request with that fingerprint. Anything else returns ErrInvalidCursor: too long, not
// base64url, not JSON of the expected shape, a missing field, an offset outside 0 to
// MaxSearchOffset, or the fingerprint of another request.
func DecodeSearchCursor(s, fingerprint string) (int, error) {
	if len(s) > MaxCursorLength {
		return 0, ErrInvalidCursor
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return 0, ErrInvalidCursor
	}
	var w searchCursorWire
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&w); err != nil || dec.More() {
		return 0, ErrInvalidCursor
	}
	if w.Kind == nil || w.Offset == nil || w.Fingerprint == nil ||
		*w.Kind != SearchCursorKind || *w.Fingerprint != fingerprint ||
		*w.Offset < 0 || *w.Offset > MaxSearchOffset {
		return 0, ErrInvalidCursor
	}
	return *w.Offset, nil
}
