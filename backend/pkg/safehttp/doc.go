// Package safehttp is an SSRF-safe HTTP client. It refuses private, loopback and
// link-local addresses on every connection and every redirect hop, and caps response
// size and content types. It has no knowledge of this application.
package safehttp
