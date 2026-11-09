-- MyHealth · marcar ejercicios con carga por lado (máquinas unilaterales, mancuernas, etc.)

ALTER TABLE exercises ADD COLUMN is_unilateral INTEGER NOT NULL DEFAULT 0;
