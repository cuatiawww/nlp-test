import os
import re

print("=== Configuring OpenAI Settings ===")

openai_endpoint = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
openai_model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
openai_key = os.getenv("OPENAI_API_KEY", "")

# 1. Update .env
env_path = "/home/aspire_5/app/NLP-PENYAKIT/.env"
if os.path.exists(env_path) and openai_key:
    with open(env_path, "r", encoding="utf-8") as f:
        env_content = f.read()

    env_content = re.sub(r"DEEPSEEK_API_KEY=.*", f"DEEPSEEK_API_KEY={openai_key}", env_content)
    env_content = re.sub(r"DEEPSEEK_BASE_URL=.*", f"DEEPSEEK_BASE_URL={openai_endpoint}", env_content)
    env_content = re.sub(r"DEEPSEEK_MODEL=.*", f"DEEPSEEK_MODEL={openai_model}", env_content)

    if "OPENAI_API_KEY=" not in env_content:
        env_content = env_content.replace(
            f"DEEPSEEK_API_KEY={openai_key}",
            f"OPENAI_API_KEY={openai_key}\nOPENAI_BASE_URL={openai_endpoint}\nOPENAI_MODEL={openai_model}\nDEEPSEEK_API_KEY={openai_key}"
        )

    with open(env_path, "w", encoding="utf-8") as f:
        f.write(env_content)
    print("✅ Successfully updated .env with OpenAI settings")

# 2. Update config.py
config_path = "/home/aspire_5/app/NLP-PENYAKIT/services/nlp-python/app/config.py"
if os.path.exists(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        config_content = f.read()

    old_config_block = '''NLP_MODEL = os.getenv("NLP_MODEL", "xlm-roberta")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "2000"))'''

    new_config_block = '''NLP_MODEL = os.getenv("NLP_MODEL", "xlm-roberta")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", OPENAI_API_KEY).strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", OPENAI_BASE_URL).rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", OPENAI_MODEL)
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", os.getenv("OPENAI_MAX_TOKENS", "2000")))'''

    if old_config_block in config_content:
        config_content = config_content.replace(old_config_block, new_config_block, 1)
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(config_content)
        print("✅ Successfully updated config.py")

# 3. Update deepseek.py to support endpoint normalization and max_completion_tokens
deepseek_path = "/home/aspire_5/app/NLP-PENYAKIT/services/nlp-python/app/deepseek.py"
if os.path.exists(deepseek_path):
    with open(deepseek_path, "r", encoding="utf-8") as f:
        deepseek_code = f.read()

    deepseek_code = deepseek_code.replace(
        'f"{config.DEEPSEEK_BASE_URL}/chat/completions"',
        '(config.DEEPSEEK_BASE_URL if config.DEEPSEEK_BASE_URL.endswith("/chat/completions") else f"{config.DEEPSEEK_BASE_URL}/chat/completions")'
    )
    deepseek_code = deepseek_code.replace(
        '"max_tokens": config.DEEPSEEK_MAX_TOKENS,',
        '"max_completion_tokens": config.DEEPSEEK_MAX_TOKENS,'
    )
    deepseek_code = deepseek_code.replace(
        '"max_tokens": 500,',
        '"max_completion_tokens": 500,'
    )

    with open(deepseek_path, "w", encoding="utf-8") as f:
        f.write(deepseek_code)
    print("✅ Successfully updated deepseek.py with OpenAI chat completions format")

# 4. Update sync_who_unknowns.py
sync_path = "/home/aspire_5/app/NLP-PENYAKIT/services/worker-python/app/sync_who_unknowns.py"
if os.path.exists(sync_path):
    with open(sync_path, "r", encoding="utf-8") as f:
        sync_code = f.read()
    sync_code = sync_code.replace(
        '"max_tokens": 500,',
        '"max_completion_tokens": 500,'
    )
    sync_code = sync_code.replace(
        'f"{DEEPSEEK_BASE_URL}/chat/completions"',
        '(DEEPSEEK_BASE_URL if DEEPSEEK_BASE_URL.endswith("/chat/completions") else f"{DEEPSEEK_BASE_URL}/chat/completions")'
    )
    with open(sync_path, "w", encoding="utf-8") as f:
        f.write(sync_code)
    print("✅ Successfully updated sync_who_unknowns.py")

# 5. Update bootstrap_multilingual_data.py
boot_path = "/home/aspire_5/app/NLP-PENYAKIT/scripts/bootstrap_multilingual_data.py"
if os.path.exists(boot_path):
    with open(boot_path, "r", encoding="utf-8") as f:
        boot_code = f.read()
    boot_code = boot_code.replace(
        '"max_tokens": 500,',
        '"max_completion_tokens": 500,'
    )
    boot_code = boot_code.replace(
        'f"{DEEPSEEK_BASE_URL}/chat/completions"',
        '(DEEPSEEK_BASE_URL if DEEPSEEK_BASE_URL.endswith("/chat/completions") else f"{DEEPSEEK_BASE_URL}/chat/completions")'
    )
    with open(boot_path, "w", encoding="utf-8") as f:
        f.write(boot_code)
    print("✅ Successfully updated bootstrap_multilingual_data.py")

print("=== All OpenAI Configuration Patches Applied ===")
