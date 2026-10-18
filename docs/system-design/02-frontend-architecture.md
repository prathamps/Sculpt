```mermaid
graph TD
    App[Next.js App]
    Pages{Pages & Layouts}
    Components[Components]
    ShadCN[UI Components <br/> (ShadCN)]
    Custom[Custom Components]
    Context{Context Providers}
    Auth[AuthContext]
    AdminAuth[AdminAuthContext]
    Socket[SocketContext]
    Hooks{Hooks}
    Lib{Lib/Utils}

    App --> Pages
    Pages --> Components
    Components --> ShadCN
    Components --> Custom
    App --> Context
    Context --> Auth
    Context --> AdminAuth
    Context --> Socket
    App --> Hooks
    App --> Lib
```

### Frontend Architecture

This diagram shows the main components of the Next.js web application.

-   **Pages & Layouts:** The main pages and layouts of the application, built with Next.js App Router.
-   **Components:** Reusable UI components.
-   **UI Components (ShadCN):** Pre-built UI components from the ShadCN library.
-   **Custom Components:** Custom UI components built for the application.
-   **Context Providers:** React context providers for managing global state.
-   **AuthContext:** Manages user authentication state.
-   **AdminAuthContext:** Manages admin authentication state.
-   **SocketContext:** Manages the WebSocket connection.
-   **Hooks:** Custom React hooks for encapsulating logic.
-   **Lib/Utils:** Utility functions and libraries.