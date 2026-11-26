# HMS Web — OPD (mock data)

Frontend of a cloud Hospital Management System for 50–100 bed hospitals in India.
Runs entirely in the browser on mock data (saved in localStorage). No backend yet.

## Run

```
npm install
npm run dev        # open http://localhost:5173
```

Pick a demo user on the login screen (press 1–6). Use the user menu (top right) to switch user or reset demo data.

| Key | User | Role |
|---|---|---|
| 1 | Rohan Mehta | Super Admin (platform) |
| 2 | Sanjay Kulkarni | Administrator |
| 3 | Priya Patil | Front Office |
| 4 | Amit Joshi | Cashier |
| 5 | Sneha Gaikwad | Nurse |
| 6 | Dr. Vikram Rao | Doctor |

More users (Accounts, MD, a second doctor, and the admin of the blank **Lotus Care Clinic**) are under
"Other users" on the login screen. Log in as Rahul Pawar (Lotus) to try the setup wizard, or as the
Super Admin to create a new clinic and accept its invite.

## Checks

```
npm run build && npm run lint && npm run test
```

Rules for contributors and coding agents are in [CLAUDE.md](./CLAUDE.md).
