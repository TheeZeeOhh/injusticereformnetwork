import json
import os

locales_dir = '/home/aziza/injusticereformnetwork/src/i18n/locales'
inputs = ['clients_keys.json', 'settings_keys.json', 'audio_keys.json']
langs = ['en', 'es', 'fr']

for in_file in inputs:
    with open(f"/home/aziza/injusticereformnetwork/{in_file}", 'r', encoding='utf-8') as f:
        input_data = json.load(f)
    namespace = input_data['namespace']
    new_keys = input_data['keys']
    
    for lang in langs:
        file_path = os.path.join(locales_dir, f'{lang}.json')
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if namespace not in data:
            data[namespace] = {}
            
        for k, v in new_keys.items():
            if k not in data[namespace]:
                if lang != 'en':
                    data[namespace][k] = f"[{lang.upper()}] {v}"
                else:
                    data[namespace][k] = v
                    
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
print("Done")
