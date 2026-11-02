package handler

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"marker/internal/api"
	"marker/internal/handler/middleware"
)

// apiPrefix is where the API is served. Per-path overrides in openapi.yaml
// (the /auth routes live at the root) are handled in policyRouter.
const apiPrefix = "/api/v1"

// publicPaths are the operations that declare `security: []` in openapi.yaml: they
// are reachable without a session.
var publicPaths = map[string]bool{
	"/auth/login":    true,
	"/auth/callback": true,
}

// Deps is everything the router needs. Leave Server nil to get only the operational
// routes (used by tests that do not touch the API).
type Deps struct {
	Server    api.StrictServerInterface
	Auth      middleware.Authenticator
	AppOrigin string // the app's origin, for the CSRF check, e.g. http://localhost:5175

	// DevLogin, if set, is served at GET /auth/dev-login. Set it only in development.
	DevLogin echo.HandlerFunc
}

// NewRouter builds the Echo instance with every route registered.
func NewRouter(deps Deps) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = ErrorHandler

	// Operational endpoint, deliberately outside /api/v1 and not part of openapi.yaml.
	e.GET("/healthz", Health)

	if deps.Server == nil {
		return e
	}

	router := policyRouter{
		echo:    e,
		session: middleware.Session(deps.Auth),
		csrf:    middleware.CSRF(deps.AppOrigin),
	}
	api.RegisterHandlers(router, api.NewStrictHandler(deps.Server, nil))

	if deps.DevLogin != nil {
		e.GET("/auth/dev-login", deps.DevLogin)
	}
	return e
}

// policyRouter is the router the generated code registers its routes on. It is where
// the cross-cutting rules from openapi.yaml are applied, once, for every operation:
//   - the path prefix (/auth/... is served at the root, everything else under /api/v1),
//   - the Session middleware, except on the public auth routes,
//   - the CSRF middleware on every state-changing method.
//
// Handlers therefore never check authentication or CSRF themselves.
type policyRouter struct {
	echo    *echo.Echo
	session echo.MiddlewareFunc
	csrf    echo.MiddlewareFunc
}

func (p policyRouter) add(method, path string, h echo.HandlerFunc, extra []echo.MiddlewareFunc) *echo.Route {
	route := apiPrefix + path
	if strings.HasPrefix(path, "/auth/") {
		route = path
	}

	var mw []echo.MiddlewareFunc
	if !publicPaths[path] {
		mw = append(mw, p.session)
	}
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		mw = append(mw, p.csrf)
	}
	mw = append(mw, extra...)

	return p.echo.Add(method, route, h, mw...)
}

// The methods below satisfy api.EchoRouter.

func (p policyRouter) CONNECT(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodConnect, path, h, m)
}

func (p policyRouter) DELETE(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodDelete, path, h, m)
}

func (p policyRouter) GET(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodGet, path, h, m)
}

func (p policyRouter) HEAD(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodHead, path, h, m)
}

func (p policyRouter) OPTIONS(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodOptions, path, h, m)
}

func (p policyRouter) PATCH(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodPatch, path, h, m)
}

func (p policyRouter) POST(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodPost, path, h, m)
}

func (p policyRouter) PUT(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodPut, path, h, m)
}

func (p policyRouter) TRACE(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodTrace, path, h, m)
}
