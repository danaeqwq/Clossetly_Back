const router = require("express").Router();
const db = require("../../config/db");

router.get("/", (req, res) => {
    const consulta = `
        SELECT id_categoria, categoria
        FROM categorias
        ORDER BY categoria
    `;

    db.query(consulta)
        .then(([categorias]) => {
            res.json({ categorias });
        })
        .catch((error) => {
            console.error("Error al obtener las categorías:", error);

            res.status(500).json({
                mensaje: "Error al obtener las categorías"
            });
        });
});

module.exports = router;
