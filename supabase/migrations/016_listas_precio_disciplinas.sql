-- ============================================
-- Migración 016: Listas de precio mayorista por disciplina
-- Pedidos internos de disciplinas con cuenta corriente
-- ============================================

-- Listas de precio
CREATE TABLE listas_precio (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items de lista de precio (precio por producto)
CREATE TABLE lista_precio_items (
  id SERIAL PRIMARY KEY,
  lista_precio_id INTEGER NOT NULL REFERENCES listas_precio(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  variante_id INTEGER REFERENCES producto_variantes(id) ON DELETE CASCADE,
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lista_precio_id, producto_id, variante_id)
);

-- Asignación de listas a disciplinas
CREATE TABLE lista_precio_disciplinas (
  id SERIAL PRIMARY KEY,
  lista_precio_id INTEGER NOT NULL REFERENCES listas_precio(id) ON DELETE CASCADE,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
  UNIQUE(lista_precio_id, disciplina_id)
);

-- Cuenta corriente de la disciplina
ALTER TABLE disciplinas
  ADD COLUMN saldo_cuenta_corriente DECIMAL(12,2) DEFAULT 0;

-- Agregar tipo 'disciplina' a pedidos
ALTER TABLE pedidos
  DROP CONSTRAINT pedidos_tipo_check;
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_tipo_check
  CHECK (tipo IN ('online', 'pos', 'disciplina'));

-- Agregar método de pago 'cuenta_corriente'
ALTER TABLE pedidos
  DROP CONSTRAINT pedidos_metodo_pago_check;
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_metodo_pago_check
  CHECK (metodo_pago IN ('mercadopago', 'efectivo', 'mercadopago_qr', 'cuenta_corriente'));

-- Referencia a disciplina en pedidos
ALTER TABLE pedidos
  ADD COLUMN disciplina_id INTEGER REFERENCES disciplinas(id);

-- Trigger para actualizar saldo de disciplina al crear pedido tipo disciplina
CREATE OR REPLACE FUNCTION actualizar_saldo_disciplina()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'disciplina' AND NEW.disciplina_id IS NOT NULL THEN
    UPDATE disciplinas
    SET saldo_cuenta_corriente = saldo_cuenta_corriente + NEW.total
    WHERE id = NEW.disciplina_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedido_disciplina_saldo
  AFTER INSERT ON pedidos
  FOR EACH ROW
  WHEN (NEW.tipo = 'disciplina')
  EXECUTE FUNCTION actualizar_saldo_disciplina();

-- Índices
CREATE INDEX idx_lista_precio_items_producto ON lista_precio_items(producto_id);
CREATE INDEX idx_lista_precio_disciplinas_disciplina ON lista_precio_disciplinas(disciplina_id);
CREATE INDEX idx_pedidos_disciplina ON pedidos(disciplina_id) WHERE disciplina_id IS NOT NULL;

-- RLS
ALTER TABLE listas_precio ENABLE ROW LEVEL SECURITY;
ALTER TABLE lista_precio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lista_precio_disciplinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listas_precio_select" ON listas_precio FOR SELECT USING (true);
CREATE POLICY "listas_precio_all" ON listas_precio FOR ALL USING (
  tiene_algun_rol(ARRAY['super_admin', 'tienda'])
);

CREATE POLICY "lista_precio_items_select" ON lista_precio_items FOR SELECT USING (true);
CREATE POLICY "lista_precio_items_all" ON lista_precio_items FOR ALL USING (
  tiene_algun_rol(ARRAY['super_admin', 'tienda'])
);

CREATE POLICY "lista_precio_disciplinas_select" ON lista_precio_disciplinas FOR SELECT USING (true);
CREATE POLICY "lista_precio_disciplinas_all" ON lista_precio_disciplinas FOR ALL USING (
  tiene_algun_rol(ARRAY['super_admin', 'tienda'])
);
