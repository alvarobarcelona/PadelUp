En este proyecto PadelUp, estamos utilizando las siguientes tecnologías y lenguajes:

Frontend (Cliente)
El frontend está construido con el ecosistema de React sobre Vite.

TypeScript (
.tsx
, 
.ts
): Es el lenguaje principal del proyecto. Usamos TypeScript para toda la lógica de componentes, estados y servicios, asegurando tipado estático y mayor robustez.
HTML (
.html
): El punto de entrada (
index.html
) para montar la aplicación React.
CSS / Tailwind:
Tailwind CSS: Usamos clases de utilidad (ej. bg-slate-900, text-white) directamente en el código JSX para el estilado.
CSS (.css): Archivos de configuración y estilos globales.
JavaScript (
.js
): Archivos de configuración de herramientas (como 
postcss.config.js
, 
tailwind.config.js
).
Backend (Servidor & Base de Datos)
El backend está gestionado por Supabase, que actúa como un "Backend-as-a-Service".

SQL (PostgreSQL) (
.sql
): Usamos SQL (PL/pgSQL) para:
Definir el esquema de la base de datos (tablas profiles, matches, messages).
Crear Funciones (RPCs) para lógica compleja (ej. confirm_match, process_expired_matches).
Configurar Triggers y Políticas de Seguridad (RLS).
En resumen, el stack es: React + TypeScript + Tailwind en el frontend y PostgreSQL (SQL) en el backend vía Supabase.