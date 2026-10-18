```mermaid
graph TD
    ExpressApp[Express.js App]
    Routes{Routes}
    Controllers{Controllers}
    Services{Services}
    Prisma{Prisma (ORM)}
    Database[PostgreSQL Database]
    RedisCache[Redis]
    Middleware{Middleware}
    AuthMiddleware[Auth Middleware]
    UploadMiddleware[Upload Middleware]
    SocketServer{Socket.io Server}

    ExpressApp --> Routes
    Routes --> Controllers
    Controllers --> Services
    Services --> Prisma
    Prisma --> Database
    Services --> RedisCache
    ExpressApp --> Middleware
    Middleware --> AuthMiddleware
    Middleware --> UploadMiddleware
    ExpressApp --> SocketServer
```

### Backend Architecture

This diagram illustrates the main modules of the Express.js API.

-   **Routes:** Defines the API endpoints.
-   **Controllers:** Handles incoming requests and sends responses.
-   **Services:** Contains the business logic of the application.
-   **Prisma (ORM):** The Object-Relational Mapper for interacting with the database.
-   **PostgreSQL Database:** The primary data store.
-   **Redis:** Used for caching and session management.
-   **Middleware:** Express middleware for handling authentication, file uploads, etc.
-   **Auth Middleware:** Authenticates users and admins.
-   **Upload Middleware:** Handles file uploads.
-   **Socket.io Server:** Handles real-time communication.