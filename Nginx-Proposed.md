---
title: Nginx
tags:
  - webserver
  - proxy
  - loadbalancing
  - webdevelopment
  - infrastructure
folder: services
---

# Nginx: High-Performance Web Server and Reverse Proxy

Nginx (pronounced "engine-x") is an open-source web server that can also be used as a reverse proxy, HTTP cache, and load balancer. Created by Igor Sysoev in 2004, it was initially developed to address the C10k problem (handling 10,000 concurrent connections) and has since become one of the most popular web servers globally due to its performance, stability, rich feature set, and low resource consumption.

## Key Features and Architecture

Nginx is known for its event-driven, asynchronous, non-blocking architecture, which allows it to handle many connections concurrently with minimal memory usage. Unlike traditional process-per-connection models, Nginx uses a master-worker process model:

*   **Master Process:** Reads configuration, binds to ports, and creates worker processes.
*   **Worker Processes:** Handle actual request processing. They are highly efficient, using an event loop to manage multiple client connections simultaneously without creating a new process or thread for each connection. This design makes Nginx exceptionally fast and memory-efficient, especially under heavy loads.

## Common Use Cases

### 1. Web Server
Nginx excels at serving static content (HTML, CSS, JavaScript, images, videos) directly to clients. Its efficient architecture means it can do this very quickly and with minimal overhead, making it a common choice for high-traffic websites.

### 2. Reverse Proxy
As a reverse proxy, Nginx sits in front of one or more backend servers, forwarding client requests to them and returning the server's responses to the client. This offers several benefits:
*   **Security:** Hides the architecture of backend servers, protecting them from direct exposure.
*   **SSL/TLS Termination:** Nginx can handle encryption/decryption, offloading this CPU-intensive task from backend application servers.
*   **Compression:** Can compress responses before sending them to clients, saving bandwidth.

### 3. Load Balancer
Nginx can distribute incoming network traffic across multiple backend servers to ensure no single server becomes a bottleneck. This is crucial for [[Scalability#Describing Load|scalability]] and [[Reliability#Kinds of Fault|high availability]]. Nginx supports various load balancing methods, including:
*   **Round Robin:** Distributes requests evenly among servers.
*   **Least Connections:** Sends new requests to the server with the fewest active connections.
*   **IP Hash:** Ensures requests from the same client IP always go to the same server, useful for maintaining session state.

This capability directly addresses how systems cope with increased load, as discussed in [[Scalability]] [4].

### 4. API Gateway
Nginx can function as an API Gateway, managing API requests by routing them, authenticating users, rate-limiting, and caching responses.

### 5. Caching
Nginx can cache responses from backend servers, storing them for future requests. This significantly reduces the load on application servers and improves response times for frequently accessed content. This is similar in principle to maintaining a cache for user timelines, as described in [[Scalability]] [6].

## Configuration Basics

Nginx uses a declarative configuration syntax, typically defined in files ending with `.conf`. The main configuration file is often located at `/etc/nginx/nginx.conf`. It's structured into blocks (e.g., `events`, `http`, `server`, `location`) that define how Nginx handles requests.

**Example (simplified):**
```nginx
http {
    server {
        listen 80;
        server_name example.com;

        location / {
            root /var/www/html;
            index index.html;
        }

        location /api/ {
            proxy_pass http://backend_servers; # Proxy to a defined upstream group
        }
    }
}
```

## Nginx vs. Apache

While both Nginx and Apache HTTP Server are dominant web servers, they have different architectural philosophies:

*   **Apache:** Traditionally uses a process-per-connection or thread-per-connection model. It is highly modular and flexible, with a vast ecosystem of modules. It's often favored for shared hosting environments or when extensive .htaccess file usage (distributed configuration) is required.
*   **Nginx:** Uses an event-driven model, making it more efficient for handling a large number of concurrent connections and serving static content. It's often preferred for high-traffic sites, reverse proxying, and load balancing due to its performance and lower resource footprint.

In many modern setups, Nginx is used as a reverse proxy in front of Apache or other application servers, leveraging Nginx's performance for static assets and load balancing, while Apache handles dynamic content and more complex application logic.
