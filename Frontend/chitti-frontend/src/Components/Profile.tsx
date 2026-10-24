import React, { useEffect, useState } from "react";
import { Avatar, Box, Card, CardContent, Chip, Typography } from "@mui/material";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import { api } from "./chittiApi";

const Profile: React.FC = () => {
  const username = localStorage.getItem("user") ?? "User";
  const [role, setRole] = useState("customer");

  useEffect(() => {
    api.get<{ role: string }>("/auth/me")
      .then(({ data }) => setRole(data.role))
      .catch((error: unknown) => {
        console.error("Could not load account role", error);
      });
  }, []);

  return (
    <Box className="page-content">
      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">ACCOUNT</Typography>
          <Typography variant="h4" className="page-title">Your profile</Typography>
          <Typography color="text.secondary">Account information for this Chitti workspace.</Typography>
        </Box>
      </Box>
      <Card className="profile-card" elevation={0}>
        <CardContent>
          <Avatar className="profile-avatar"><PersonRoundedIcon /></Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 750 }}>{username}</Typography>
            <Typography color="text.secondary">Signed in to Chitti Manager</Typography>
            <Chip
              icon={<VerifiedUserRoundedIcon />}
              label={role === "owner" ? "App owner" : "Customer account"}
              color="success"
              variant="outlined"
              size="small"
              sx={{ mt: 1.5 }}
            />
          </Box>
        </CardContent>
      </Card>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {role === "owner"
          ? "You can change your own password or manage customer accounts from the header."
          : "You can change your password at any time from the header. Only the owner can create accounts."}
      </Typography>
    </Box>
  );
};

export default Profile;
