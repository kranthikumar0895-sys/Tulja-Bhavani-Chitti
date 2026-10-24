import React from "react";
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Dashboard from "./Dashboard";
import ChittiGroup from "./chittigroup";
import ChittiDetails from "./Chittidetails";
import MonthlyPayments from "./Monthlypayment";
import Profile from "./Profile";
import Login from "./login";   // ✅ new login page
import "./Styles.css";

const RequireAuth: React.FC = () => {
  return localStorage.getItem("access_token") ? <Outlet /> : <Navigate to="/login" replace />;
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
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chitti-group" element={<ChittiGroup />} />
            <Route path="/chitti-details/:name" element={<ChittiDetails />} />
            <Route path="/monthly-payments" element={<MonthlyPayments />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
