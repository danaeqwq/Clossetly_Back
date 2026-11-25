
const router = require("express").Router();
const db = require("../../config/db");

// POST: comprobar si existe el correo
router.post("/correo", async (req, res) => {
    try {
        const { correo } = req.body;

        if (!correo || !correo.trim()) {
            return res.status(400).json({
                mensaje: "Ingresá un correo electrónico"
            });
        }

        const consulta = `
            SELECT Id_usuario, correo
            FROM usuarios
            WHERE correo = ?
        `;

        const [resultados] = await db.query(
            consulta,
            [correo.trim()]
        );

        if (resultados.length === 0) {
            return res.status(404).json({
                mensaje: "No existe una cuenta asociada a este correo"
            });
        }

        return res.status(200).json({
            mensaje: "Correo encontrado"
        });

    } catch (error) {
        console.error("Error al comprobar el correo:", error);

        return res.status(500).json({
            mensaje: "Error al procesar la solicitud"
        });
    }
});

module.exports = router;
