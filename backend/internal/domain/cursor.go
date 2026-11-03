package domain

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ListMode says which of the two bookmark lists a cursor belongs to.
type ListMode string

const (
	// ListLive is the live list, ordered by created_at DESC, id DESC.
	ListLive ListMode = "live"
	// ListTrash is the trash, ordered by deleted_at DESC, id DESC.
	ListTrash ListMode = "trash"
)

// MaxCursorLength is the longest cursor string DecodeCursor accepts.
const MaxCursorLength = 512

// ErrInvalidCursor means a cursor string does not decode, or was made for the other list.
var ErrInvalidCursor = errors.New("invalid cursor")

// Cursor is a position in a list: the sort timestamp and id of the last row returned.
// At is created_at for ListLive and deleted_at for ListTrash.
type Cursor struct {
	Mode ListMode
	At   time.Time
	ID   uuid.UUID
}

type cursorWire struct {
	Mode *ListMode  `json:"m"`
	At   *string    `json:"t"`
	ID   *uuid.UUID `json:"id"`
}

// EncodeCursor returns the opaque string for c: base64url, without padding, of a small
// JSON object. The timestamp is RFC 3339 with nanosecond precision, in UTC.
func EncodeCursor(c Cursor) string {
	at := c.At.UTC().Format(time.RFC3339Nano)
	raw, err := json.Marshal(cursorWire{Mode: &c.Mode, At: &at, ID: &c.ID})
	if err != nil {
		// Marshalling three plain values cannot fail.
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

// DecodeCursor parses a cursor made by EncodeCursor for the list in mode. Anything else
// returns ErrInvalidCursor: too long, not base64url, not JSON of the expected shape, a
// missing or unparseable timestamp, an id that is not a UUID, or a cursor of the other mode.
func DecodeCursor(s string, mode ListMode) (Cursor, error) {
	if len(s) > MaxCursorLength {
		return Cursor{}, ErrInvalidCursor
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, ErrInvalidCursor
	}
	var w cursorWire
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&w); err != nil || dec.More() {
		return Cursor{}, ErrInvalidCursor
	}
	if w.Mode == nil || w.At == nil || w.ID == nil || *w.Mode != mode {
		return Cursor{}, ErrInvalidCursor
	}
	at, err := time.Parse(time.RFC3339Nano, *w.At)
	if err != nil {
		return Cursor{}, ErrInvalidCursor
	}
	return Cursor{Mode: *w.Mode, At: at.UTC(), ID: *w.ID}, nil
}
