import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";

const Sidebar: React.FC = () => {
  const location = useLocation();
  const links = [
    { label: "Dashboard", path: "/", icon: <DashboardRoundedIcon /> },
    { label: "Chitti groups", path: "/chitti-group", icon: <GroupsRoundedIcon /> },
    { label: "Monthly payments", path: "/monthly-payments", icon: <PaymentsRoundedIcon /> },
    { label: "Profile", path: "/profile", icon: <PersonRoundedIcon /> },
  ];

  return (
    <Box component="aside" className="sidebar">
      <Box className="brand">
        <Box className="brand-mark">C</Box>
        <Box>
          <Typography className="brand-name">Chitti</Typography>
          <Typography className="brand-caption">MANAGEMENT</Typography>
        </Box>
      </Box>
      <Typography className="nav-caption">WORKSPACE</Typography>
      <List className="sidebar-nav" disablePadding>
        {links.map((link) => {
          const selected = link.path === "/"
            ? location.pathname === "/"
            : location.pathname === link.path || location.pathname.startsWith(`${link.path}/`);
          return (
            <ListItemButton
              key={link.path}
              component={Link}
              to={link.path}
              selected={selected}
              className="sidebar-link"
            >
              <ListItemIcon>{link.icon}</ListItemIcon>
              <ListItemText primary={link.label} />
            </ListItemButton>
          );
        })}
      </List>
      <Box className="sidebar-bottom">
        <Typography variant="caption">24-month schedules · live totals</Typography>
      </Box>
    </Box>
  );
};

export default Sidebar;