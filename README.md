# canteen-connect

Menu and ordering app for the college canteen. Built with React, TypeScript and Vite.

## Running it

You need Node 22 or newer.

```
npm install
npm run dev     # opens on http://localhost:5173
npm test
```

## How it's supposed to work

Menu
- Search matches item names, ignoring capital letters and extra spaces.
- Category tabs, "Veg only" and search can all be used together.
- "Recommended" is the order items are listed in `src/lib/menu.ts`. Sorting by price and switching back to Recommended should bring that order back.
- Sold-out items can't be added.

Cart
- The cart is saved in the browser, so it's still there after a page reload.
- Setting an item's quantity to 0 removes it.

Bill
- Coupon codes work in any case (`save10` is the same as `SAVE10`).
  - `FLAT50`: ₹50 off orders of ₹200 or more.
  - `SAVE10`: 10% off, but never more than ₹100.
- Delivery is ₹30, and free when the amount after discount is ₹300 or more.
- GST is 5% of the amount after discount.

## Backend & Authentication (Firebase)

The application integrates with Firebase for student authentication and real-time order storage:
- **College Student Restriction**: Account registration requires an official `@spit.ac.in` college email.
- **Protected Checkout**: Placing orders requires an authenticated student account.
- **Real-Time Orders**: Orders are persisted in Firestore under the `orders` collection (`userId`, `items`, `totalBill`, `status`, `timestamp`) and synced live with status badges.
- **Graceful Fallbacks**: Clear error prompts guide developers when Firebase credentials have not been configured yet.

### Setting Up Firebase for New Contributors

To connect your own Firebase project for local development:

1. **Create a Firebase Project**:
   - Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.

2. **Register a Web App**:
   - In Project Overview/Settings, click the **Web (`</>`)** icon to register a web app.
   - Give it a nickname (e.g., `canteen-connect`) and register it.
   - Copy the `firebaseConfig` keys provided.

3. **Enable Authentication Providers**:
   - Go to **Build** > **Authentication** > click **Get Started**.
   - Under the **Sign-in method** tab:
     - **Email/Password**: Click **Email/Password**, toggle **Enable** ON, and click **Save**.
     - **Google** (Optional): Click **Add new provider** > **Google**, toggle **Enable** ON, pick a project support email, and click **Save**.

4. **Create a Firestore Database**:
   - Go to **Build** > **Firestore Database** > click **Create database**.
   - Select **Start in test mode** for development read/write permissions.
   - Choose your nearest cloud location (e.g., `asia-south1 (Mumbai)`) and click **Create**.

5. **Set Up Local Environment Variables**:
   - In the project root, create a `.env` file from the example template:
     ```bash
     cp .env.example .env
     ```
   - Paste your Firebase config values into `.env`:
     ```env
     VITE_FIREBASE_API_KEY=your_api_key
     VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your_project
     VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
     VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     VITE_FIREBASE_APP_ID=your_app_id
     ```

6. **Start the Application**:
   ```bash
   npm run dev
   ```

## Code

- `src/lib/firebase.ts`: Firebase client initialization (Auth & Firestore)
- `src/lib/orders.ts`: Firestore orders storage & real-time listener
- `src/lib/auth-validation.ts`: College domain (@spit.ac.in) validation logic
- `src/context/AuthContext.tsx`: React Context for authentication state
- `src/components/Login.tsx` & `src/components/Signup.tsx`: Authentication UI
- `src/lib/menu.ts`: menu data, search, filters, sorting
- `src/lib/cart.ts`: adding and removing items
- `src/lib/pricing.ts`: coupons, delivery, GST, totals
- `src/App.tsx`, `src/components/`: the UI
- `src/lib/*.test.ts`: tests (Vitest)

## Contributing

Fork the repo, make your changes on a new branch, and open a pull request. Run `npm test` and `npm run build` first.

If you find a bug, open an issue with the steps to reproduce it, what you expected, and what happened instead.

Part of Source Start by CSI SPIT. MIT licensed.
