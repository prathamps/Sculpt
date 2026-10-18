```mermaid
graph TD
    User[User]
    WebApp{Sculpt Web App <br/> (Next.js)}
    API{Sculpt API <br/> (Express.js)}
    Database[(PostgreSQL Database)]
    Cache[(Redis <br/> for Caching/Sessions)]
    SocketServer[Socket.io Server]

    User --> WebApp
    WebApp --> API
    API --> Database
    API --> Cache
    API --> SocketServer
    WebApp --> SocketServer
```

### High-Level Architecture

This diagram shows the main components of the Sculpt application and how they interact.

-   **User:** The end-user of the application.
-   **Sculpt Web App (Next.js):** The frontend of the application, built with Next.js. It is responsible for rendering the UI and handling user interactions.
-   **Sculpt API (Express.js):** The backend of the application, built with Express.js. It provides a RESTful API for the frontend to consume.
-   **PostgreSQL Database:** The primary data store for the application.
-   **Redis:** Used for caching and session management.
-   **Socket.io Server:** Handles real-time communication between the frontend and backend.