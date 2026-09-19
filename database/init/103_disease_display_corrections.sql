UPDATE nlp_keywords
SET target_label = 'Malaria',
    is_active = TRUE,
    updated_at = NOW()
WHERE category = 'disease'
  AND keyword = 'malaria';
