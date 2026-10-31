package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

type healthResponse struct {
	Status string `json:"status"`
}

// Health reports that the process is up. It checks no dependencies.
func Health(c echo.Context) error {
	return c.JSON(http.StatusOK, healthResponse{Status: "ok"})
}
