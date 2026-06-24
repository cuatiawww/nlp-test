UPDATE nlp_keywords
SET is_active = FALSE,
    updated_at = NOW()
WHERE category = 'symptom'
  AND keyword IN ('kasus', 'korban', 'kematian', 'meninggal');
