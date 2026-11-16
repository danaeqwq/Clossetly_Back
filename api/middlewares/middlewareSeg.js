
const jwt = require("jsonwebtoken");
const { TOKEN_SECRET } = process.env;

// VERIFICAR TOKEN
function middlewareSeg(req, res, next) {
    const autorizacion = req.headers.authorization;

    if (!autorizacion || !autorizacion.startsWith("Bearer ")) {
        return res.status(401).json({
            mensaje: "No se proporcionó un token"
        });
    }

    const token = autorizacion.split(" ")[1];

    try {
        const user = jwt.verify(token, TOKEN_SECRET);

        req.user = user;

        next();

    } catch (error) {
        console.error("Error al verificar token:", error);

        res.status(403).json({
            mensaje: "Token inválido o vencido"
        });
    }
}

module.exports = middlewareSeg;
