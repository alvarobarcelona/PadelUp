I am using the following technologies and languages in the PadelUp project:

Frontend (Client)

The frontend is built using the React ecosystem with Vite.

TypeScript (.tsx, .ts): I use TypeScript as the main language of the project. I rely on it for all component logic, state management, and services, ensuring static typing and greater robustness.

HTML (.html): I use index.html as the entry point to mount the React application.

CSS / Tailwind:

Tailwind CSS: I use utility-first classes (e.g. bg-slate-900, text-white) directly in JSX for styling.

CSS (.css): I use CSS files for global styles and configuration.

JavaScript (.js): I use JavaScript mainly for tool configuration files such as postcss.config.js and tailwind.config.js.

Backend (Server & Database)

The backend is managed by Supabase, which I use as a Backend-as-a-Service (BaaS).

SQL (PostgreSQL) (.sql): I use SQL (PL/pgSQL) to:

Define the database schema (e.g. profiles, matches, messages tables).

Create functions (RPCs) for complex business logic (e.g. confirm_match, process_expired_matches).

Configure triggers and Row Level Security (RLS) policies.

Summary

In summary, I am using React, TypeScript, and Tailwind on the frontend, and PostgreSQL on the backend