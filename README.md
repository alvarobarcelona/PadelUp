# PadelUp - Social Padel Tracker

**PadelUp** is a modern, mobile-first web application designed for amateur padel groups to track matches, maintain competitive ELO rankings, and foster community through social features and gamification.



## 🚀 Features

### 🎾 Core Match Tracking

- **Smart Interface**: Select 4 players and enter set scores.
- **Auto-Winner Logic**: Automatically determines the winning team based on set scores.
- **ELO System**: Updates player ratings immediately after every match using a standard K-factor algorithm.

### 🏆 Gamification

- **Achievements**: Unlockable badges for milestones (e.g., "First Blood", "On Fire", "Comeback King").
- **Leaderboards**: Real-time ranking sorted by ELO with top-3 highlighting.
- **Activity Feed**: See recent matches and unlocked achievements.

### 🤝 Social & Community

- **Friendships**: Send and accept friend requests to build your network.
- **Internal Chat**: Direct messaging system between friends.
- **Notifications**: Alerts for new messages and friend requests.

### 🛠️ Administration

- **User Management**: Approve/Ban users and manage roles.
- **Match Oversight**: Review and override match results if necessary.
- **Reporting**: View system logs and user activity.

---

## 💻 Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v3, Lucide React Icons
- **Backend**: Supabase (PostgreSQL 17, Auth, Edge Functions)
- **Internationalization**: `i18next` (English/Spanish support)

---

## 🗄️ Database Schema

The application runs on a robust PostgreSQL schema featuring Row Level Security (RLS) for data protection.

### Key Tables

- **`profiles`**: User data, ELO ratings, and stats. Linked to Supabase Auth.
- **`matches`**: Stores teams, scores (`jsonb`), and match status (`pending`, `confirmed`).
- **`friendships`**: Manages connections between users (`pending`/`accepted`).
- **`achievements`**: Definitions of all unlockable badges.
- **`user_achievements`**: Records of badges earned by users.
- **`messages`**: Real-time chat messages.

### Key Functions

- `confirm_match()`: Atomically updates ELO ratings and match status.
- `process_expired_matches()`: Auto-confirms pending matches after 24h.

---

## 🔄 Infrastructure & DevOps

### Automated Backups

Data integrity is secured via **GitHub Actions**.

- **Workflow**: `.github/workflows/backup.yml`
- **Schedule**: Runs daily at **03:00 AM Local Time** (02:00 UTC).
- **Strategy**: Uses `pg_dump` to generate two SQL files:
  1. `backup_YYYY-MM-DD.sql`: **Optimized public schema dump** (Structure + Data). -> _Primary Backup_
  2. _Legacy_: Previously supported full server dumps (deprecated for efficiency).
- **CI Safety**: Commits include `[skip ci]` to prevent Vercel build loops.

---

## 📦 Local Development

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/padel-up.git
   ```

2. **Install dependencies**

   ```bash
   cd padel-up
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
