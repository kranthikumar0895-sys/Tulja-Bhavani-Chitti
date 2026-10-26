
import React from "react";
import {
  HashRouter as Router,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { Box } from "@mui/material";

import Sidebar from "./Sidebar";
import Header from "./Header";
import Dashboard from "./Dashboard";
import ChittiGroup from "./chittigroup";
import ChittiDetails from "./Chittidetails";
import MonthlyPayments from "./Monthlypayment";
import Profile from "./Profile";
import Login from "./login";

// If these components already exist, use the correct file names.
// Otherwise, create them before using these imports.
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

import "./Styles.css";

const RequireAuth: React.FC = () => {
  const token = localStorage.getItem("access_token");

  return token ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
};

const AppLayout: React.FC = () => (
  <Box className="app-shell">
    <Sidebar />
    <Box className="app-main">
      <Header />
      <Box component="main" className="route-content">
        <Outlet />
      </Box>
    </Box>
  </Box>
);

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Public pages */}
        <Route path="/login" element={<Login />} />
        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />
        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />

        {/* Protected pages */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/chitti-group"
              element={<ChittiGroup />}
            />
            <Route
              path="/chitti-details/:name"
              element={<ChittiDetails />}
            />
            <Route
              path="/monthly-payments"
              element={<MonthlyPayments />}
            />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>

        {/* Unknown paths go to login */}
        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />
      </Routes>
    </Router>
  );
};

export default App;
