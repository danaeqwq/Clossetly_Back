const router = require("express").Router();
const db = require("../../config/db");

router.get("/", (req, res) => {
  const idUsuario = req.user.id;

  const consulta = `
    SELECT
      o.id_outfit AS id,
      o.nombre,
      o.descripcion,
      o.privacidad,
      oc.ocacion AS ocasion,
      g.genero,
      t.temporada,

      (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', p.id_prenda,
            'nombre', p.nombre,
            'imagen', p.imagen
          )
        )
        FROM prendas_outfits po
        INNER JOIN prendas p ON po.id_prenda = p.id_prenda
        WHERE po.id_outfit = o.id_outfit
      ) AS prendas

    FROM outfits o
    LEFT JOIN ocaciones oc ON o.id_ocasion = oc.id_ocacion
    LEFT JOIN generos g ON o.id_genero = g.id_genero
    LEFT JOIN temporadas t ON o.id_temporada = t.id_temporada

    WHERE o.Id_usuario = ?
    ORDER BY o.id_outfit DESC
  `;

  db.query(consulta, [idUsuario])
    .then(([outfits]) => {
      res.json({ outfits });
    })
    .catch((error) => {
      console.error("Error al obtener los outfits:", error);

      res.status(500).json({
        mensaje: "Error al obtener los outfits",
      });
    });
});

router.get("/:id", (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  const consulta = `
    SELECT
      o.id_outfit AS id,
      o.nombre,
      o.descripcion,
      o.privacidad,
      oc.ocacion AS ocasion,
      g.genero,
      t.temporada,

      (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', p.id_prenda,
            'nombre', p.nombre,
            'imagen', p.imagen
          )
        )
        FROM prendas_outfits po
        INNER JOIN prendas p ON po.id_prenda = p.id_prenda
        WHERE po.id_outfit = o.id_outfit
      ) AS prendas

    FROM outfits o
    LEFT JOIN ocaciones oc ON o.id_ocasion = oc.id_ocacion
    LEFT JOIN generos g ON o.id_genero = g.id_genero
    LEFT JOIN temporadas t ON o.id_temporada = t.id_temporada

    WHERE o.id_outfit = ? AND o.Id_usuario = ?
  `;

  db.query(consulta, [id, idUsuario])
    .then(([resultado]) => {
      if (resultado.length === 0) {
        res.status(404).json({
          mensaje: "Outfit no encontrado",
        });
        return;
      }

      res.json({ outfit: resultado[0] });
    })
    .catch((error) => {
      console.error("Error al obtener el outfit:", error);

      res.status(500).json({
        mensaje: "Error al obtener el outfit",
      });
    });
});

router.post("/", (req, res) => {
  const idUsuario = req.user.id;

  const {
    nombre,
    descripcion,
    privacidad,
    temporada,
    ocasion,
    genero,
    prendas = [],
  } = req.body;

  const idsPrendas = prendas.map((prenda) =>
    Number(
      typeof prenda === "object" ? (prenda.id ?? prenda.id_prenda) : prenda,
    ),
  );

  if (
    !nombre ||
    idsPrendas.length === 0 ||
    idsPrendas.some((id) => !Number.isInteger(id) || id <= 0)
  ) {
    return res.status(400).json({
      mensaje: "El nombre y al menos una prenda son obligatorios",
    });
  }

  let idTemporada;
  let idOcasion;
  let idGenero;

  db.query(
    `SELECT id_prenda FROM prendas
     WHERE Id_usuario = ? AND id_prenda IN (?)`,
    [idUsuario, idsPrendas],
  )
    .then(([prendasValidas]) => {
      if (prendasValidas.length !== idsPrendas.length) {
        res.status(400).json({
          mensaje: "Una o más prendas no pertenecen a tu armario",
        });
        return null;
      }

      return db.query(
        "SELECT id_temporada FROM temporadas WHERE temporada = ?",
        [temporada],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [temporadas] = resultado;

      if (temporadas.length === 0) {
        res.status(400).json({
          mensaje: "La temporada, ocasión o género no son válidos",
        });
        return null;
      }

      idTemporada = temporadas[0].id_temporada;

      return db.query("SELECT id_ocacion FROM ocaciones WHERE ocacion = ?", [
        ocasion,
      ]);
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [ocasiones] = resultado;

      if (ocasiones.length === 0) {
        res.status(400).json({
          mensaje: "La temporada, ocasión o género no son válidos",
        });
        return null;
      }

      idOcasion = ocasiones[0].id_ocacion;

      return db.query("SELECT id_genero FROM generos WHERE genero = ?", [
        genero,
      ]);
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [generos] = resultado;

      if (generos.length === 0) {
        res.status(400).json({
          mensaje: "La temporada, ocasión o género no son válidos",
        });
        return null;
      }

      idGenero = generos[0].id_genero;

      return db.query(
        `INSERT INTO outfits
         (Id_usuario, nombre, descripcion, privacidad, id_ocasion, id_genero, id_temporada)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          idUsuario,
          nombre,
          descripcion || null,
          privacidad ? 1 : 0,
          idOcasion,
          idGenero,
          idTemporada,
        ],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [insertado] = resultado;
      const idOutfit = insertado.insertId;

      const valoresPrendas = idsPrendas.map((idPrenda) => [idPrenda, idOutfit]);

      return db
        .query("INSERT INTO prendas_outfits (id_prenda, id_outfit) VALUES ?", [
          valoresPrendas,
        ])
        .then(() => idOutfit);
    })
    .then((idOutfit) => {
      if (idOutfit === null || res.headersSent) return;

      res.status(201).json({
        mensaje: "Outfit creado correctamente",
        id_outfit: idOutfit,
      });
    })
    .catch((error) => {
      console.error("Error al crear el outfit:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al crear el outfit",
        });
      }
    });
});

router.put("/:id", (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  const {
    nombre,
    descripcion,
    privacidad,
    temporada,
    ocasion,
    genero,
    prendas = [],
  } = req.body;

  const idsPrendas = prendas.map((prenda) =>
    Number(
      typeof prenda === "object" ? (prenda.id ?? prenda.id_prenda) : prenda,
    ),
  );

  if (
    !nombre ||
    idsPrendas.length === 0 ||
    idsPrendas.some((id) => !Number.isInteger(id) || id <= 0)
  ) {
    return res.status(400).json({
      mensaje: "El nombre y al menos una prenda son obligatorios",
    });
  }

  let idTemporada;
  let idOcasion;
  let idGenero;

  db.query(
    "SELECT id_outfit FROM outfits WHERE id_outfit = ? AND Id_usuario = ?",
    [id, idUsuario],
  )
    .then(([outfits]) => {
      if (outfits.length === 0) {
        res.status(404).json({
          mensaje: "Outfit no encontrado",
        });
        return null;
      }

      return db.query(
        `SELECT id_prenda FROM prendas
         WHERE Id_usuario = ? AND id_prenda IN (?)`,
        [idUsuario, idsPrendas],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [prendasValidas] = resultado;

      if (prendasValidas.length !== idsPrendas.length) {
        res.status(400).json({
          mensaje: "Una o más prendas no pertenecen a tu armario",
        });
        return null;
      }

      return db.query(
        "SELECT id_temporada FROM temporadas WHERE temporada = ?",
        [temporada],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [temporadas] = resultado;

      if (temporadas.length === 0) {
        res.status(400).json({
          mensaje: "La temporada, ocasión o género no son válidos",
        });
        return null;
      }

      idTemporada = temporadas[0].id_temporada;

      return db.query("SELECT id_ocacion FROM ocaciones WHERE ocacion = ?", [
        ocasion,
      ]);
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [ocasiones] = resultado;

      if (ocasiones.length === 0) {
        res.status(400).json({
          mensaje: "La temporada, ocasión o género no son válidos",
        });
        return null;
      }

      idOcasion = ocasiones[0].id_ocacion;

      return db.query("SELECT id_genero FROM generos WHERE genero = ?", [
        genero,
      ]);
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [generos] = resultado;

      if (generos.length === 0) {
        res.status(400).json({
          mensaje: "La temporada, ocasión o género no son válidos",
        });
        return null;
      }

      idGenero = generos[0].id_genero;

      return db.query(
        `UPDATE outfits SET
          nombre = ?,
          descripcion = ?,
          privacidad = ?,
          id_ocasion = ?,
          id_genero = ?,
          id_temporada = ?
         WHERE id_outfit = ? AND Id_usuario = ?`,
        [
          nombre,
          descripcion || null,
          privacidad ? 1 : 0,
          idOcasion,
          idGenero,
          idTemporada,
          id,
          idUsuario,
        ],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      return db.query("DELETE FROM prendas_outfits WHERE id_outfit = ?", [id]);
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const valoresPrendas = idsPrendas.map((idPrenda) => [
        idPrenda,
        Number(id),
      ]);

      return db.query(
        "INSERT INTO prendas_outfits (id_prenda, id_outfit) VALUES ?",
        [valoresPrendas],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return;

      res.json({
        mensaje: "Outfit modificado correctamente",
      });
    })
    .catch((error) => {
      console.error("Error al modificar el outfit:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al modificar el outfit",
        });
      }
    });
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  db.query(
    "SELECT id_outfit FROM outfits WHERE id_outfit = ? AND Id_usuario = ?",
    [id, idUsuario],
  )
    .then(([outfits]) => {
      if (outfits.length === 0) {
        res.status(404).json({
          mensaje: "Outfit no encontrado",
        });
        return null;
      }

      return db.query("DELETE FROM prendas_outfits WHERE id_outfit = ?", [id]);
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      return db.query("DELETE FROM outfit_estilo WHERE id_outfit = ?", [id]);
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      return db.query(
        "DELETE FROM outfits WHERE id_outfit = ? AND Id_usuario = ?",
        [id, idUsuario],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return;

      res.json({
        mensaje: "Outfit eliminado correctamente",
      });
    })
    .catch((error) => {
      console.error("Error al eliminar el outfit:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al eliminar el outfit",
        });
      }
    });
});

module.exports = router;
