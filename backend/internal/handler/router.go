package handler

import "github.com/labstack/echo/v4"

// NewRouter builds the Echo instance with every route registered.
func NewRouter() *echo.Echo {
	e := echo.New()
	e.HideBanner = true

	// Operational endpoint, deliberately outside /api/v1 and not part of openapi.yaml.
	e.GET("/healthz", Health)

	return e
}
