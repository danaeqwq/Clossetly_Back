
const router = require("express").Router();
const db = require("../../../config/db");

router.get("/", (req, res) => {
    db.query(
        `SELECT
            p.Id_pregunta,
            p.pregunta,
            o.id_opcion,
            o.opcion,
            c.codigo AS codigo_color
         FROM preguntas p
         INNER JOIN opciones o
            ON p.Id_pregunta = o.id_pregunta
         LEFT JOIN colores c
            ON c.color = o.opcion
         ORDER BY p.Id_pregunta, o.id_opcion`
    )
    .then(([datos]) => {
        const preguntas = [];
        datos.forEach(dato => {
            let pregunta = preguntas.find(
                p => p.Id_pregunta === dato.Id_pregunta
            );
            if (!pregunta) {
                pregunta = {
                    Id_pregunta: dato.Id_pregunta,
                    pregunta: dato.pregunta,
                    opciones: []
                };
                preguntas.push(pregunta);
            }

            pregunta.opciones.push({
                id_opcion: dato.id_opcion,
                opcion: dato.opcion,
                codigo_color: dato.codigo_color
            });
        });

        res.status(200).json(preguntas);
    })
    .catch(error => {
        console.error(error);
        res.status(500).json({
            mensaje: "Error al obtener las preguntas"
        });
    });
});

module.exports = router;
