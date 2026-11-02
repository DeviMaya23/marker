package domain

import "errors"

// ErrUnauthenticated means the request carries no valid session.
var ErrUnauthenticated = errors.New("unauthenticated")
