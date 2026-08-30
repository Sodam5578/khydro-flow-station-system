const jwt = require("jsonwebtoken");
const JWT_SECRET = "khydro_water_infra_secret_key_2026_jwt_token_secure";

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      region: user.region,
      team: user.team
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다. (인증 토큰 없음)" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "유효하지 않거나 만료된 토큰입니다." });
  }
}

module.exports = { generateToken, verifyToken, JWT_SECRET };
