const router = require("express").Router();
const db = require("../../config/db");

// Obtener todas las opciones disponibles para los filtros
router.get("/", (req, res) => {
    const consultas = [
        "SELECT categoria FROM categorias ORDER BY categoria",
        "SELECT talla FROM tallas ORDER BY talla",
        "SELECT temporada FROM temporadas ORDER BY temporada",
        "SELECT id_estado_prenda, estado_prenda FROM estados_prenda ORDER BY id_estado_prenda",
        "SELECT ocacion FROM ocaciones ORDER BY ocacion",
        "SELECT genero FROM generos ORDER BY genero",
        "SELECT color, codigo FROM colores ORDER BY color",
        "SELECT estilo FROM estilos ORDER BY estilo"
    ];

    Promise.all(
        consultas.map((consulta) => db.query(consulta))
    )
        .then(([
            [categorias],
            [talles],
            [temporadas],
            [estados],
            [ocasiones],
            [generos],
            [colores],
            [estilos]
        ]) => {
            res.json({
                categorias,
                talles,
                temporadas,
                estados,
                ocasiones,
                generos,
                colores,
                estilos
            });
        })
        .catch((error) => {
            console.error("Error al obtener opciones de filtros:", error);

            res.status(500).json({
                mensaje: "Error al obtener las opciones de filtros"
            });
        });
});

module.exports = router;