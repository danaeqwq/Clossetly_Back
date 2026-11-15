const router = require("express").Router();
const compraRouter = require("./publicaciones/publicaciones_compra_main");
const intercambioRouter = require("./publicaciones/publicaciones_intercambio_main");
const filtrosRouter = require("./filtros/filtros_main");
router.use("/publicaciones/compra", compraRouter);
router.use("/publicaciones/intercambio", intercambioRouter);
router.use("/filtros", filtrosRouter);

module.exports = router;