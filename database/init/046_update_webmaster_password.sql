-- Update the webmaster login credential without storing the plaintext password.
-- Authentication uses SHA-256 in services/backend-rust/src/main.rs.
UPDATE users
SET password_hash = 'c132b43b26a559d0b176bedbdd1c3e4ced99fcfe6c7cfa989aff4f6bc8dafa94',
    updated_at = NOW()
WHERE username = 'webmaster'
  AND password_hash IS DISTINCT FROM 'c132b43b26a559d0b176bedbdd1c3e4ced99fcfe6c7cfa989aff4f6bc8dafa94';
