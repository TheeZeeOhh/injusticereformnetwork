import json
import sys
import os

def update_locale(file_path, namespace, new_keys):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if namespace not in data:
        data[namespace] = {}
        
    for k, v in new_keys.items():
        if k not in data[namespace]:
            data[namespace][k] = v
            
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        # Add trailing newline
        f.write('\n')

if __name__ == '__main__':
    locales_dir = '/home/aziza/injusticereformnetwork/src/i18n/locales'
    
    input_data = json.load(sys.stdin)
    namespace = input_data['namespace']
    new_keys = input_data['keys']
    
    for lang in ['en', 'es', 'fr']:
        file_path = os.path.join(locales_dir, f'{lang}.json')
        lang_keys = {}
        for k, v in new_keys.items():
            if lang != 'en':
                lang_keys[k] = f"[{lang.upper()}] {v}"
            else:
                lang_keys[k] = v
        update_locale(file_path, namespace, lang_keys)
    print("Done")
