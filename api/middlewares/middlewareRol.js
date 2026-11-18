
function middlewareRol(rolPermitido) {
    return (req, res, next) => {
        if (req.user.rol !== rolPermitido) {
            return res.status(403).json({
                mensaje: "No tenés permisos para acceder"
            });
        }
        next();
    };
}
module.exports = middlewareRol;
