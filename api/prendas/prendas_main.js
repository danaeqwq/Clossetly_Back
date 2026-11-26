const router = require("express").Router();
const db = require("../../config/db");

function procesarLista(lista) {
  if (Array.isArray(lista)) return lista;
  if (typeof lista === "string" && lista) return JSON.parse(lista);
  return [];
}

router.get("/", (req, res) => {
  const idUsuario = req.user.id;

  const consulta = `
    SELECT
      p.id_prenda AS id,
      p.nombre,
      p.imagen,
      p.privacidad,
      ca.id_categoria AS idCategoria,
      ca.categoria,
      ta.talla AS talle,
      te.temporada,
      ep.estado_prenda AS estado,
      oc.ocacion AS ocasion,
      g.genero,
      co.color,
      co.codigo AS codigoColor,
      (
        SELECT JSON_ARRAYAGG(e.estilo)
        FROM prendas_estilos pe
        INNER JOIN estilos e ON pe.id_estilo = e.id_estilo
        WHERE pe.id_prenda = p.id_prenda
      ) AS estilos
    FROM prendas p
    LEFT JOIN categorias ca ON p.id_categoria = ca.id_categoria
    LEFT JOIN tallas ta ON p.id_talla = ta.id_talla
    LEFT JOIN temporadas te ON p.id_temporada = te.id_temporada
    LEFT JOIN estados_prenda ep ON p.id_estado_prenda = ep.id_estado_prenda
    LEFT JOIN ocaciones oc ON p.id_ocacion = oc.id_ocacion
    LEFT JOIN generos g ON p.id_genero = g.id_genero
    LEFT JOIN colores co ON p.id_color = co.id_color
    WHERE p.Id_usuario = ?
    AND NOT EXISTS (
      SELECT 1
      FROM publicaciones_compra pc
      WHERE pc.id_prenda = p.id_prenda
    )
    AND NOT EXISTS (
      SELECT 1
      FROM publicaciones_intercambio pi
      WHERE pi.id_prenda = p.id_prenda
    )
    ORDER BY p.id_prenda DESC
  `;

  db.query(consulta, [idUsuario])
    .then(([prendas]) => {
      res.json({ prendas });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al obtener las prendas",
      });
    });
});

router.get("/disponibles-intercambio", (req, res) => {
  const idUsuario = req.user.id;
  const idPublicacion = req.query.publicacion;

  if (!idPublicacion) {
    return res.status(400).json({
      mensaje: "Falta indicar la publicación de intercambio",
    });
  }

  const consultaPublicacion = `
    SELECT
      pi.Id_publicacion_intercambio,
      pi.talle_buscado,
      pi.estado_MA,
      p.Id_usuario,
      p.privacidad
    FROM publicaciones_intercambio pi
    INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
    WHERE pi.Id_publicacion_intercambio = ?
  `;

  db.query(consultaPublicacion, [idPublicacion])
    .then(([publicaciones]) => {
      if (publicaciones.length === 0) {
        return res.status(404).json({
          mensaje: "La publicación no existe",
        });
      }

      const publicacion = publicaciones[0];

      if (Number(publicacion.Id_usuario) === Number(idUsuario)) {
        return res.status(400).json({
          mensaje: "No podés proponer un intercambio en tu propia publicación",
        });
      }

      if (Number(publicacion.privacidad) !== 1) {
        return res.status(409).json({
          mensaje: "La publicación no está disponible",
        });
      }

      const consulta = `
        SELECT
          p.id_prenda AS id,
          p.nombre,
          p.imagen,
          p.privacidad,
          ca.id_categoria AS idCategoria,
          ca.categoria,
          ta.talla AS talle,
          te.temporada,
          ep.estado_prenda AS estado,
          oc.ocacion AS ocasion,
          g.genero,
          co.color,
          co.codigo AS codigoColor,
          (
            SELECT JSON_ARRAYAGG(e.estilo)
            FROM prendas_estilos pe
            INNER JOIN estilos e ON pe.id_estilo = e.id_estilo
            WHERE pe.id_prenda = p.id_prenda
          ) AS estilos
        FROM prendas p
        LEFT JOIN categorias ca ON p.id_categoria = ca.id_categoria
        LEFT JOIN tallas ta ON p.id_talla = ta.id_talla
        LEFT JOIN temporadas te ON p.id_temporada = te.id_temporada
        LEFT JOIN estados_prenda ep ON p.id_estado_prenda = ep.id_estado_prenda
        LEFT JOIN ocaciones oc ON p.id_ocacion = oc.id_ocacion
        LEFT JOIN generos g ON p.id_genero = g.id_genero
        LEFT JOIN colores co ON p.id_color = co.id_color
        WHERE p.Id_usuario = ?
        AND p.privacidad = 1
        AND p.id_talla = ?
        AND (? IS NULL OR p.id_estado_prenda <= ?)
        AND NOT EXISTS (
          SELECT 1
          FROM publicaciones_compra pc
          WHERE pc.id_prenda = p.id_prenda
        )
        AND EXISTS (
          SELECT 1
          FROM categorias_aceptadas cat
          WHERE cat.id_publicacion_intercambio = ?
          AND cat.id_categoria = p.id_categoria
        )
        AND NOT EXISTS (
          SELECT 1
          FROM propuestas pr
          INNER JOIN estados_propuestas ep
            ON pr.estado_propuesta = ep.Id_estado_propuesta
          WHERE pr.prenda_ofrecida = p.id_prenda
          AND ep.estado_propuesta IN ('Pendiente', 'Confirmado')
        )
        ORDER BY p.id_prenda DESC
      `;

      return db.query(consulta, [
        idUsuario,
        publicacion.talle_buscado,
        publicacion.estado_MA,
        publicacion.estado_MA,
        idPublicacion,
      ]);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [prendas] = resultado;
      res.json({ prendas });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al obtener prendas disponibles para intercambio",
      });
    });
});

router.post("/", (req, res) => {
  const idUsuario = req.user.id;

  const {
    nombre,
    categoria,
    talle,
    temporada,
    ocasion,
    genero,
    estado,
    privacidad,
    colores = [],
    estilos = [],
  } = req.body;

  let rutaImagen = null;

  Promise.resolve()
    .then(() => {
      const listaColores = procesarLista(colores);
      const listaEstilos = procesarLista(estilos);

      const archivo = req.files?.imagen;

      if (archivo) {
        const nombreArchivo = `${Date.now()}-${archivo.name}`;
        rutaImagen = `/uploads/prendas/${nombreArchivo}`;

        return archivo.mv(`uploads/prendas/${nombreArchivo}`).then(() => {
          return { listaColores, listaEstilos };
        });
      }

      return { listaColores, listaEstilos };
    })
    .then(({ listaColores, listaEstilos }) => {
      const consulta = `
        INSERT INTO prendas (
          Id_usuario,
          id_genero,
          id_temporada,
          id_color,
          nombre,
          privacidad,
          id_estado_prenda,
          id_talla,
          imagen,
          id_ocacion,
          id_categoria
        )
        VALUES (
          ?,
          (SELECT id_genero FROM generos WHERE genero = ?),
          (SELECT id_temporada FROM temporadas WHERE temporada = ?),
          (SELECT id_color FROM colores WHERE color = ?),
          ?,
          ?,
          (SELECT id_estado_prenda FROM estados_prenda WHERE estado_prenda = ?),
          (SELECT id_talla FROM tallas WHERE talla = ?),
          ?,
          (SELECT id_ocacion FROM ocaciones WHERE ocacion = ?),
          (SELECT id_categoria FROM categorias WHERE categoria = ?)
        )
      `;

      return db
        .query(consulta, [
          idUsuario,
          genero,
          temporada,
          listaColores[0] || null,
          nombre,
          privacidad,
          estado,
          talle,
          rutaImagen,
          ocasion,
          categoria,
        ])
        .then(([resultado]) => {
          const idPrenda = resultado.insertId;

          if (listaEstilos.length === 0) {
            return { idPrenda };
          }

          const consultaEstilos = `
          INSERT INTO prendas_estilos (id_prenda, id_estilo)
          SELECT ?, id_estilo
          FROM estilos
          WHERE estilo IN (?)
        `;

          return db
            .query(consultaEstilos, [idPrenda, listaEstilos])
            .then(() => ({ idPrenda }));
        });
    })
    .then(({ idPrenda }) => {
      res.status(201).json({
        mensaje: "Prenda creada correctamente",
        id_prenda: idPrenda,
        imagen: rutaImagen,
      });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al crear la prenda",
      });
    });
});

router.put("/:id", (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  const {
    nombre,
    categoria,
    talle,
    temporada,
    ocasion,
    genero,
    estado,
    privacidad,
    colores = [],
    estilos = [],
  } = req.body;

  let rutaImagen = null;

  Promise.resolve()
    .then(() => {
      const listaColores = procesarLista(colores);
      const listaEstilos = procesarLista(estilos);
      const archivo = req.files?.imagen;

      if (archivo) {
        const nombreArchivo = `${Date.now()}-${archivo.name}`;
        rutaImagen = `/uploads/prendas/${nombreArchivo}`;

        return archivo.mv(`uploads/prendas/${nombreArchivo}`).then(() => {
          return { listaColores, listaEstilos };
        });
      }

      return { listaColores, listaEstilos };
    })
    .then(({ listaColores, listaEstilos }) => {
      const consulta = `
        UPDATE prendas
        SET
          nombre = ?,
          id_categoria = (
            SELECT id_categoria FROM categorias
            WHERE categoria = ?
          ),
          id_talla = (
            SELECT id_talla FROM tallas
            WHERE talla = ?
          ),
          id_temporada = (
            SELECT id_temporada FROM temporadas
            WHERE temporada = ?
          ),
          id_ocacion = (
            SELECT id_ocacion FROM ocaciones
            WHERE ocacion = ?
          ),
          id_genero = (
            SELECT id_genero FROM generos
            WHERE genero = ?
          ),
          id_estado_prenda = (
            SELECT id_estado_prenda FROM estados_prenda
            WHERE estado_prenda = ?
          ),
          id_color = (
            SELECT id_color FROM colores
            WHERE color = ?
          ),
          privacidad = ?,
          imagen = COALESCE(?, imagen)
        WHERE id_prenda = ?
        AND Id_usuario = ?
      `;

      return db
        .query(consulta, [
          nombre,
          categoria,
          talle,
          temporada,
          ocasion,
          genero,
          estado,
          listaColores[0] || null,
          privacidad,
          rutaImagen,
          id,
          idUsuario,
        ])
        .then(([resultado]) => {
          if (resultado.affectedRows === 0) {
            return res.status(404).json({
              mensaje: "Prenda no encontrada",
            });
          }

          return db
            .query("DELETE FROM prendas_estilos WHERE id_prenda = ?", [id])
            .then(() => {
              if (listaEstilos.length === 0) return;

              const consultaEstilos = `
            INSERT INTO prendas_estilos (id_prenda, id_estilo)
            SELECT ?, id_estilo
            FROM estilos
            WHERE estilo IN (?)
          `;

              return db.query(consultaEstilos, [id, listaEstilos]);
            });
        });
    })
    .then(() => {
      if (res.headersSent) return;

      res.json({
        mensaje: "Prenda modificada correctamente",
        imagen: rutaImagen,
      });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al modificar la prenda",
      });
    });
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  const consultaEstilos = `
    DELETE pe
    FROM prendas_estilos pe
    INNER JOIN prendas p ON pe.id_prenda = p.id_prenda
    WHERE p.id_prenda = ?
    AND p.Id_usuario = ?
  `;

  const consultaPrenda = `
    DELETE FROM prendas
    WHERE id_prenda = ?
    AND Id_usuario = ?
  `;

  db.query(consultaEstilos, [id, idUsuario])
    .then(() => {
      return db.query(consultaPrenda, [id, idUsuario]);
    })
    .then(([resultado]) => {
      if (resultado.affectedRows === 0) {
        return res.status(404).json({
          mensaje: "Prenda no encontrada",
        });
      }

      res.json({
        mensaje: "Prenda eliminada correctamente",
      });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al eliminar la prenda",
      });
    });
});

module.exports = router;
